package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	devbilling "cubory/api/internal/billing/dev"
	paddlebilling "cubory/api/internal/billing/paddle"
	stripebilling "cubory/api/internal/billing/stripe"
	"cubory/api/internal/config"
	"cubory/api/internal/domain"
	"cubory/api/internal/repo/postgres"
	"cubory/api/internal/service/auth"
	"cubory/api/internal/service/billing"
	"cubory/api/internal/service/email"
	"cubory/api/internal/service/license"
	"cubory/api/internal/signing"
	transporthttp "cubory/api/internal/transport/http"
)

func getenvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg, err := config.FromEnv()
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(1)
	}

	if err := postgres.Migrate(cfg.DatabaseURL); err != nil {
		log.Error("migrate", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := postgres.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("db", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Wiring (Konstruktor-DI)
	users := postgres.NewUserRepo(pool)
	licenses := postgres.NewLicenseRepo(pool)
	sessions := postgres.NewSessionRepo(pool)
	refresh := postgres.NewRefreshTokenRepo(pool)
	emailTokens := postgres.NewEmailTokenRepo(pool)
	devices := postgres.NewDeviceRepo(pool)
	audit := postgres.NewAuditRepo(pool)

	var mailer domain.Mailer
	if host := os.Getenv("CUBORY_SMTP_HOST"); host != "" {
		mailer = &email.SMTPMailer{
			Host: host, Port: getenvDefault("CUBORY_SMTP_PORT", "587"),
			User: os.Getenv("CUBORY_SMTP_USER"), Pass: os.Getenv("CUBORY_SMTP_PASS"),
			From: getenvDefault("CUBORY_SMTP_FROM", "Cubory <no-reply@cubory.app>"),
		}
		log.Info("mailer", "provider", "smtp", "host", host)
	} else {
		mailer = &email.DevMailer{Log: log}
	}

	// Trial-Ende-Erinnerung (T-48h), idempotent über audit_logs
	(&email.TrialReminder{Pool: pool, Mailer: mailer, Log: log}).Start(ctx)

	authSvc := auth.New(auth.Config{
		JWTSecret:       cfg.JWTSecret,
		AccessTokenTTL:  cfg.AccessTokenTTL,
		RefreshTokenTTL: cfg.RefreshTokenTTL,
		TrialDays:       cfg.TrialDays,
		AppBaseURL:      cfg.AppBaseURL,
	}, users, licenses, sessions, refresh, emailTokens, devices, audit, mailer)

	// Ed25519-Signer: prod aus env-Seed, dev deterministisch aus dem Secret
	var signer *signing.Signer
	if seed := os.Getenv("CUBORY_LICENSE_SIGNING_SEED"); seed != "" {
		signer, err = signing.FromSeedB64(seed)
		if err != nil {
			log.Error("signing", "err", err)
			os.Exit(1)
		}
	} else {
		if cfg.Env == "prod" {
			log.Error("signing", "err", "CUBORY_LICENSE_SIGNING_SEED ist in prod Pflicht")
			os.Exit(1)
		}
		signer = signing.DevDeterministic(cfg.JWTSecret)
	}
	log.Info("license signing", "public_key", signer.PublicKeyB64())

	licenseSvc := license.New(licenses, devices, users, audit, signer)

	// Billing: Stripe wenn konfiguriert, sonst Dev-Provider
	var provider domain.BillingProvider
	if key := os.Getenv("PADDLE_API_KEY"); key != "" {
		provider = paddlebilling.New(paddlebilling.Config{
			APIKey:        key,
			WebhookSecret: os.Getenv("PADDLE_WEBHOOK_SECRET"),
			APIBase:       os.Getenv("PADDLE_API_BASE"),
			PriceMonthly:  os.Getenv("PADDLE_PRICE_MONTHLY"),
			PriceYearly:   os.Getenv("PADDLE_PRICE_YEARLY"),
			PriceLifetime: os.Getenv("PADDLE_PRICE_LIFETIME"),
		})
		log.Info("billing", "provider", "paddle")
	} else if key := os.Getenv("STRIPE_SECRET_KEY"); key != "" {
		provider = stripebilling.New(stripebilling.Config{
			SecretKey:       key,
			WebhookSecret:   os.Getenv("STRIPE_WEBHOOK_SECRET"),
			PriceMonthly:    os.Getenv("STRIPE_PRICE_MONTHLY"),
			PriceYearly:     os.Getenv("STRIPE_PRICE_YEARLY"),
			PriceLifetime:   os.Getenv("STRIPE_PRICE_LIFETIME"),
			SuccessURL:      cfg.AppBaseURL + "/checkout/success",
			CancelURL:       cfg.AppBaseURL + "/checkout/cancelled",
			PortalReturnURL: cfg.AppBaseURL,
		})
		log.Info("billing", "provider", "stripe")
	} else {
		if cfg.Env == "prod" {
			log.Error("billing", "err", "PADDLE_API_KEY (oder STRIPE_SECRET_KEY) ist in prod Pflicht")
			os.Exit(1)
		}
		provider = devbilling.New()
		log.Info("billing", "provider", "dev")
	}
	billingSvc := billing.New(provider, users, licenses,
		postgres.NewSubscriptionRepo(pool), postgres.NewPaymentRepo(pool),
		postgres.NewWebhookRepo(pool), audit)

	router := transporthttp.NewRouter(transporthttp.Deps{
		Pool:             pool,
		AdminEmail:       getenvDefault("CUBORY_ADMIN_EMAIL", "info@cubory.app"),
		JWTSecret:        cfg.JWTSecret,
		Auth:             authSvc,
		License:          licenseSvc,
		Billing:          billingSvc,
		LicensePubKeyB64: signer.PublicKeyB64(),
	})

	srv := &http.Server{Addr: cfg.Addr, Handler: router, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		log.Info("cubory-api läuft", "addr", cfg.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Info("beendet")
}

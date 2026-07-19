package billing_test

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	devbilling "cubory/api/internal/billing/dev"
	"cubory/api/internal/domain"
	"cubory/api/internal/repo/postgres"
	"cubory/api/internal/service/auth"
	"cubory/api/internal/service/billing"
	"cubory/api/internal/service/license"
	"cubory/api/internal/signing"
)

const testDBURL = "postgres://localhost:5432/cubory_test?sslmode=disable"

type nullMailer struct{}

func (nullMailer) Send(context.Context, string, string, string) error { return nil }

func setup(t *testing.T) (*billing.Service, *license.Service, *domain.User, *pgxpool.Pool) {
	t.Helper()
	if os.Getenv("CUBORY_SKIP_DB_TESTS") != "" {
		t.Skip("DB-Tests deaktiviert")
	}
	if err := postgres.Migrate(testDBURL); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	pool, err := postgres.Connect(context.Background(), testDBURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(context.Background(), `TRUNCATE users, licenses, subscriptions, payments,
		invoices, devices, sessions, refresh_tokens, email_tokens, webhook_events, audit_logs CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	users := postgres.NewUserRepo(pool)
	licenses := postgres.NewLicenseRepo(pool)
	audit := postgres.NewAuditRepo(pool)

	authSvc := auth.New(auth.Config{
		JWTSecret: []byte("t"), AccessTokenTTL: time.Minute, RefreshTokenTTL: time.Hour,
		TrialDays: 7, AppBaseURL: "http://t",
	}, users, licenses, postgres.NewSessionRepo(pool), postgres.NewRefreshTokenRepo(pool),
		postgres.NewEmailTokenRepo(pool), postgres.NewDeviceRepo(pool), audit, nullMailer{})

	user, _, err := authSvc.Register(context.Background(), "W", "billing@test.de", "sehr-sicher-123", "")
	if err != nil {
		t.Fatal(err)
	}

	billingSvc := billing.New(devbilling.New(), users, licenses,
		postgres.NewSubscriptionRepo(pool), postgres.NewPaymentRepo(pool),
		postgres.NewWebhookRepo(pool), audit)
	licSvc := license.New(licenses, postgres.NewDeviceRepo(pool), users, audit,
		signing.DevDeterministic([]byte("t")))
	return billingSvc, licSvc, user, pool
}

func webhook(t *testing.T, svc *billing.Service, ev domain.BillingEvent) {
	t.Helper()
	if ev.ProviderEventID == "" {
		ev.ProviderEventID = "evt_" + uuid.NewString()
	}
	payload, _ := json.Marshal(ev)
	if err := svc.HandleWebhook(context.Background(), payload, ""); err != nil {
		t.Fatalf("webhook %s: %v", ev.Type, err)
	}
}

func TestSubscriptionLifecycle(t *testing.T) {
	billingSvc, licSvc, user, _ := setup(t)
	ctx := context.Background()
	periodEnd := time.Now().Add(30 * 24 * time.Hour)

	// Abo angelegt → Trial wird abgelöst, Lizenz = monthly
	webhook(t, billingSvc, domain.BillingEvent{
		Type: domain.EvSubscriptionCreated, UserID: user.ID, CustomerID: "cus_1",
		SubscriptionID: "sub_1", Interval: domain.BillingMonthly, PeriodEnd: &periodEnd,
	})
	st, _, err := licSvc.Effective(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if st.Kind != "monthly" || st.Plan != "pro" {
		t.Fatalf("nach subscription_created: %s/%s, want monthly/pro", st.Kind, st.Plan)
	}

	// Zahlung verlängert die Periode
	newEnd := periodEnd.Add(30 * 24 * time.Hour)
	webhook(t, billingSvc, domain.BillingEvent{
		Type: domain.EvPaymentSucceeded, SubscriptionID: "sub_1", PaymentID: "pi_1",
		InvoiceID: "in_1", InvoiceNumber: "V-0001", AmountCents: 990, Currency: "eur", PeriodEnd: &newEnd,
	})
	st, _, _ = licSvc.Effective(ctx, user.ID)
	if !st.ExpiresAt.Equal(newEnd) {
		t.Errorf("expires_at = %v, want %v", st.ExpiresAt, newEnd)
	}

	// Kündigung: Pro bleibt bis Periodenende, danach Free
	webhook(t, billingSvc, domain.BillingEvent{Type: domain.EvSubscriptionCancelled, SubscriptionID: "sub_1"})
	st, _, _ = licSvc.Effective(ctx, user.ID)
	if st.Kind != "monthly" {
		t.Errorf("direkt nach Kündigung: %s, want monthly (Restlaufzeit bezahlt)", st.Kind)
	}
	licSvc.SetNow(func() time.Time { return newEnd.Add(4 * 24 * time.Hour) }) // Periodenende + Kulanz vorbei
	st, _, _ = licSvc.Effective(ctx, user.ID)
	if st.Kind != "free" {
		t.Errorf("nach Periodenende: %s, want free", st.Kind)
	}
}

func TestLifetimeAndRefund(t *testing.T) {
	billingSvc, licSvc, user, _ := setup(t)
	ctx := context.Background()

	webhook(t, billingSvc, domain.BillingEvent{
		Type: domain.EvLifetimePurchased, UserID: user.ID, CustomerID: "cus_2",
		PaymentID: "pi_life", AmountCents: 14900, Currency: "eur",
	})
	st, _, err := licSvc.Effective(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if st.Kind != "lifetime" || st.ExpiresAt != nil {
		t.Fatalf("lifetime: %s expires=%v, want lifetime/nil", st.Kind, st.ExpiresAt)
	}

	// Refund beendet die Lifetime-Lizenz → Free
	webhook(t, billingSvc, domain.BillingEvent{
		Type: domain.EvRefund, UserID: user.ID, PaymentID: "pi_life",
	})
	st, _, _ = licSvc.Effective(ctx, user.ID)
	if st.Kind != "free" {
		t.Errorf("nach Refund: %s, want free", st.Kind)
	}
}

func TestWebhookIdempotency(t *testing.T) {
	billingSvc, licSvc, user, pool := setup(t)
	ctx := context.Background()
	periodEnd := time.Now().Add(30 * 24 * time.Hour)

	ev := domain.BillingEvent{
		ProviderEventID: "evt_fixed", Type: domain.EvSubscriptionCreated, UserID: user.ID,
		CustomerID: "cus_3", SubscriptionID: "sub_3", Interval: domain.BillingYearly, PeriodEnd: &periodEnd,
	}
	payload, _ := json.Marshal(ev)
	if err := billingSvc.HandleWebhook(ctx, payload, ""); err != nil {
		t.Fatal(err)
	}
	// gleiche Event-ID nochmal → no-op, keine zweite Lizenz
	if err := billingSvc.HandleWebhook(ctx, payload, ""); err != nil {
		t.Fatal(err)
	}
	var count int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM licenses WHERE user_id = $1`, user.ID).Scan(&count)
	if count != 2 { // Trial (expired) + yearly
		t.Errorf("licenses = %d, want 2", count)
	}
	st, _, _ := licSvc.Effective(ctx, user.ID)
	if st.Kind != "yearly" {
		t.Errorf("kind = %s, want yearly", st.Kind)
	}
}

func TestSubscriptionWithoutPeriodEnd(t *testing.T) {
	billingSvc, licSvc, user, _ := setup(t)
	ctx := context.Background()
	// Provider-Event ohne PeriodEnd (z.B. Trial-Abo mit unvollständigen Daten)
	webhook(t, billingSvc, domain.BillingEvent{
		Type: domain.EvSubscriptionCreated, UserID: user.ID, CustomerID: "cus_np",
		SubscriptionID: "sub_np", Interval: domain.BillingMonthly,
	})
	st, _, err := licSvc.Effective(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if st.Kind != "monthly" {
		t.Fatalf("kind = %s, want monthly", st.Kind)
	}
	if st.ExpiresAt == nil {
		t.Fatal("Abo ohne Periodenende darf keine unbefristete Lizenz werden")
	}
	if d := time.Until(*st.ExpiresAt); d > 40*24*time.Hour {
		t.Errorf("Fallback zu großzügig: %v", d)
	}
}

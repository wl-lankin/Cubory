// Package billing: Checkout/Portal/Kündigen über einen BillingProvider und die
// idempotente Verarbeitung normalisierter Webhook-Events zu Lizenzänderungen.
package billing

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"cubory/api/internal/domain"
)

type Service struct {
	provider domain.BillingProvider
	users    domain.UserRepo
	licenses domain.LicenseRepo
	subs     domain.SubscriptionRepo
	payments domain.PaymentRepo
	webhooks domain.WebhookRepo
	audit    domain.AuditRepo
	now      func() time.Time
}

func New(provider domain.BillingProvider, users domain.UserRepo, licenses domain.LicenseRepo,
	subs domain.SubscriptionRepo, payments domain.PaymentRepo, webhooks domain.WebhookRepo,
	audit domain.AuditRepo) *Service {
	return &Service{provider: provider, users: users, licenses: licenses, subs: subs,
		payments: payments, webhooks: webhooks, audit: audit, now: time.Now}
}

func (s *Service) SetNow(now func() time.Time) { s.now = now }

/* ── Nutzeraktionen ──────────────────────────────────────────────────────── */

func (s *Service) CreateCheckout(ctx context.Context, userID uuid.UUID, plan domain.BillingPlan) (string, error) {
	u, err := s.users.ByID(ctx, userID)
	if err != nil {
		return "", err
	}
	return s.provider.CreateCheckout(ctx, u, plan)
}

func (s *Service) PortalURL(ctx context.Context, userID uuid.UUID) (string, error) {
	sub, err := s.subs.ByUser(ctx, userID)
	if err != nil {
		return "", err
	}
	return s.provider.CreatePortalSession(ctx, sub.ProviderCustomerID)
}

func (s *Service) Cancel(ctx context.Context, userID uuid.UUID) error {
	sub, err := s.subs.ByUser(ctx, userID)
	if err != nil {
		return err
	}
	if err := s.provider.CancelAtPeriodEnd(ctx, sub.ProviderSubscriptionID); err != nil {
		return err
	}
	sub.CancelAtPeriodEnd = true
	sub.Status = "cancelled"
	return s.subs.Upsert(ctx, sub)
}

func (s *Service) Resume(ctx context.Context, userID uuid.UUID) error {
	sub, err := s.subs.ByUser(ctx, userID)
	if err != nil {
		return err
	}
	if err := s.provider.Resume(ctx, sub.ProviderSubscriptionID); err != nil {
		return err
	}
	sub.CancelAtPeriodEnd = false
	sub.Status = "active"
	return s.subs.Upsert(ctx, sub)
}

func (s *Service) Subscription(ctx context.Context, userID uuid.UUID) (*domain.Subscription, error) {
	return s.subs.ByUser(ctx, userID)
}

/* ── Webhook-Verarbeitung ────────────────────────────────────────────────── */

// HandleWebhook parst, dedupliziert und verarbeitet ein Provider-Event.
func (s *Service) HandleWebhook(ctx context.Context, payload []byte, signature string) error {
	ev, err := s.provider.ParseWebhook(payload, signature)
	if err != nil {
		return err
	}
	if ev == nil {
		return nil // Event-Typ, der uns nicht interessiert
	}
	fresh, err := s.webhooks.InsertEvent(ctx, "stripe", ev.ProviderEventID, string(ev.Type), ev.RawPayload)
	if err != nil {
		return err
	}
	if !fresh {
		return nil // schon verarbeitet - Stripe liefert Events mehrfach
	}
	procErr := s.Apply(ctx, ev)
	s.webhooks.MarkProcessed(ctx, ev.ProviderEventID, procErr)
	return procErr
}

// Apply setzt ein normalisiertes Event in Lizenz-/Abo-Zustand um.
// Exportiert, damit Tests die Logik ohne Provider-Wire-Format prüfen können.
func (s *Service) Apply(ctx context.Context, ev *domain.BillingEvent) error {
	switch ev.Type {

	case domain.EvLifetimePurchased:
		if err := s.retireActiveLicense(ctx, ev.UserID); err != nil {
			return err
		}
		now := s.now()
		if err := s.licenses.Create(ctx, &domain.License{
			ID: uuid.New(), UserID: ev.UserID, PlanID: "pro", Kind: domain.KindLifetime,
			Status: domain.LicenseActive, StartsAt: now, CreatedAt: now, UpdatedAt: now,
		}); err != nil {
			return err
		}
		_ = s.payments.Insert(ctx, ev.UserID, nil, ev.PaymentID, ev.AmountCents, ev.Currency, "succeeded", &now)
		s.audit.Write(ctx, domain.AuditEntry{UserID: &ev.UserID, Actor: "webhook", Action: "lifetime_purchased"})
		return nil

	case domain.EvSubscriptionCreated:
		if err := s.retireActiveLicense(ctx, ev.UserID); err != nil {
			return err
		}
		kind := domain.KindMonthly
		if ev.Interval == domain.BillingYearly {
			kind = domain.KindYearly
		}
		now := s.now()
		// Sicherung: Ohne Periodenende (unvollständiges Provider-Event) würde
		// ExpiresAt=nil eine unbefristete Lizenz erzeugen. Konservativ begrenzen -
		// die nächste Zahlung/Aktualisierung schreibt den echten Wert.
		expires := ev.PeriodEnd
		if expires == nil {
			fallback := now.Add(35 * 24 * time.Hour)
			expires = &fallback
			s.audit.Write(ctx, domain.AuditEntry{UserID: &ev.UserID, Actor: "system",
				Action: "subscription_without_period_end",
				Detail: map[string]any{"fallback_until": fallback}})
		}
		lic := &domain.License{
			ID: uuid.New(), UserID: ev.UserID, PlanID: "pro", Kind: kind,
			Status: domain.LicenseActive, StartsAt: now, ExpiresAt: expires,
			CreatedAt: now, UpdatedAt: now,
		}
		if err := s.licenses.Create(ctx, lic); err != nil {
			return err
		}
		if err := s.subs.Upsert(ctx, &domain.Subscription{
			ID: uuid.New(), UserID: ev.UserID, LicenseID: lic.ID, Provider: "stripe",
			ProviderCustomerID: ev.CustomerID, ProviderSubscriptionID: ev.SubscriptionID,
			Interval: string(ev.Interval), Status: "active",
			CurrentPeriodEnd: expires, CreatedAt: now, UpdatedAt: now,
		}); err != nil {
			return err
		}
		s.audit.Write(ctx, domain.AuditEntry{UserID: &ev.UserID, Actor: "webhook",
			Action: "subscription_created", Detail: map[string]any{"kind": kind}})
		return nil

	case domain.EvPaymentSucceeded:
		sub, err := s.subs.ByProviderID(ctx, ev.SubscriptionID)
		if err != nil {
			return fmt.Errorf("payment für unbekanntes Abo %s: %w", ev.SubscriptionID, err)
		}
		lic, err := s.licenses.ActiveByUser(ctx, sub.UserID)
		if err != nil {
			return err
		}
		lic.ExpiresAt = ev.PeriodEnd
		lic.Status = domain.LicenseActive
		if err := s.licenses.Update(ctx, lic); err != nil {
			return err
		}
		sub.CurrentPeriodEnd = ev.PeriodEnd
		sub.Status = "active"
		if err := s.subs.Upsert(ctx, sub); err != nil {
			return err
		}
		now := s.now()
		_ = s.payments.Insert(ctx, sub.UserID, &sub.ID, ev.PaymentID, ev.AmountCents, ev.Currency, "succeeded", &now)
		if ev.InvoiceID != "" {
			_ = s.payments.InsertInvoice(ctx, sub.UserID, ev.InvoiceID, ev.InvoiceNumber, ev.InvoicePDF,
				ev.AmountCents, ev.Currency, now)
		}
		return nil

	case domain.EvPaymentFailed:
		sub, err := s.subs.ByProviderID(ctx, ev.SubscriptionID)
		if err != nil {
			return err
		}
		lic, err := s.licenses.ActiveByUser(ctx, sub.UserID)
		if err != nil {
			return err
		}
		// Pro bleibt bis Periodenende + Kulanz - nur Status markieren
		lic.Status = domain.LicensePastDue
		if err := s.licenses.Update(ctx, lic); err != nil {
			return err
		}
		lic.Status = domain.LicenseActive // past_due zählt weiter als aktive Lizenz
		sub.Status = "past_due"
		_ = s.subs.Upsert(ctx, sub)
		s.audit.Write(ctx, domain.AuditEntry{UserID: &sub.UserID, Actor: "webhook", Action: "payment_failed"})
		return nil

	case domain.EvSubscriptionUpdated, domain.EvSubscriptionResumed:
		sub, err := s.subs.ByProviderID(ctx, ev.SubscriptionID)
		if err != nil {
			return err
		}
		sub.CancelAtPeriodEnd = ev.CancelAtEnd
		if ev.PeriodEnd != nil {
			sub.CurrentPeriodEnd = ev.PeriodEnd
		}
		if ev.Type == domain.EvSubscriptionResumed {
			sub.Status = "active"
		}
		return s.subs.Upsert(ctx, sub)

	case domain.EvSubscriptionCancelled:
		sub, err := s.subs.ByProviderID(ctx, ev.SubscriptionID)
		if err != nil {
			return err
		}
		sub.Status = "cancelled"
		if err := s.subs.Upsert(ctx, sub); err != nil {
			return err
		}
		// Lizenz sofort beenden → License-Service materialisiert Free beim
		// nächsten Zugriff (ExpiresAt bleibt: Restlaufzeit ist bezahlt).
		s.audit.Write(ctx, domain.AuditEntry{UserID: &sub.UserID, Actor: "webhook", Action: "subscription_cancelled"})
		return nil

	case domain.EvRefund:
		_ = s.payments.MarkRefunded(ctx, ev.PaymentID)
		// Lifetime-Refund: Lizenz beenden
		if ev.UserID != uuid.Nil {
			lic, err := s.licenses.ActiveByUser(ctx, ev.UserID)
			if err == nil && lic.Kind == domain.KindLifetime {
				now := s.now()
				lic.ExpiresAt = &now
				if err := s.licenses.Update(ctx, lic); err != nil {
					return err
				}
				s.audit.Write(ctx, domain.AuditEntry{UserID: &ev.UserID, Actor: "webhook", Action: "lifetime_refunded"})
			}
		}
		return nil
	}
	return nil
}

// retireActiveLicense beendet die aktuell aktive Lizenz (Trial/Free/Alt-Abo),
// bevor eine neue Pro-Lizenz angelegt wird.
func (s *Service) retireActiveLicense(ctx context.Context, userID uuid.UUID) error {
	lic, err := s.licenses.ActiveByUser(ctx, userID)
	if err != nil {
		if err == domain.ErrNotFound {
			return nil
		}
		return err
	}
	lic.Status = domain.LicenseExpired
	return s.licenses.Update(ctx, lic)
}

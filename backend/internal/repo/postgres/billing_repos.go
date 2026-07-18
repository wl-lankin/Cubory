package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"cubory/api/internal/domain"
)

/* ── Subscriptions ───────────────────────────────────────────────────────── */

type SubscriptionRepo struct{ pool *pgxpool.Pool }

func NewSubscriptionRepo(pool *pgxpool.Pool) *SubscriptionRepo { return &SubscriptionRepo{pool} }

func (r *SubscriptionRepo) Upsert(ctx context.Context, s *domain.Subscription) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO subscriptions (id, user_id, license_id, provider, provider_customer_id,
			provider_subscription_id, interval, status, cancel_at_period_end, current_period_end, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (provider_subscription_id) DO UPDATE SET
			license_id = EXCLUDED.license_id, status = EXCLUDED.status,
			cancel_at_period_end = EXCLUDED.cancel_at_period_end,
			current_period_end = EXCLUDED.current_period_end, updated_at = now()`,
		s.ID, s.UserID, s.LicenseID, s.Provider, s.ProviderCustomerID,
		s.ProviderSubscriptionID, s.Interval, s.Status, s.CancelAtPeriodEnd,
		s.CurrentPeriodEnd, s.CreatedAt, s.UpdatedAt)
	return err
}

const subCols = `id, user_id, license_id, provider, provider_customer_id,
	provider_subscription_id, interval, status, cancel_at_period_end, current_period_end, created_at, updated_at`

func (r *SubscriptionRepo) scan(row pgx.Row) (*domain.Subscription, error) {
	var s domain.Subscription
	err := row.Scan(&s.ID, &s.UserID, &s.LicenseID, &s.Provider, &s.ProviderCustomerID,
		&s.ProviderSubscriptionID, &s.Interval, &s.Status, &s.CancelAtPeriodEnd,
		&s.CurrentPeriodEnd, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &s, err
}

func (r *SubscriptionRepo) ByUser(ctx context.Context, userID uuid.UUID) (*domain.Subscription, error) {
	return r.scan(r.pool.QueryRow(ctx, `SELECT `+subCols+` FROM subscriptions
		WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, userID))
}

func (r *SubscriptionRepo) ByProviderID(ctx context.Context, providerSubID string) (*domain.Subscription, error) {
	return r.scan(r.pool.QueryRow(ctx, `SELECT `+subCols+` FROM subscriptions
		WHERE provider_subscription_id = $1`, providerSubID))
}

/* ── Payments & Invoices ─────────────────────────────────────────────────── */

type PaymentRepo struct{ pool *pgxpool.Pool }

func NewPaymentRepo(pool *pgxpool.Pool) *PaymentRepo { return &PaymentRepo{pool} }

func (r *PaymentRepo) Insert(ctx context.Context, userID uuid.UUID, subscriptionID *uuid.UUID,
	providerPaymentID string, amountCents int, currency, status string, paidAt *time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO payments (user_id, subscription_id, provider_payment_id, amount_cents, currency, status, paid_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (provider_payment_id) DO NOTHING`,
		userID, subscriptionID, providerPaymentID, amountCents, currency, status, paidAt)
	return err
}

func (r *PaymentRepo) MarkRefunded(ctx context.Context, providerPaymentID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE payments SET status = 'refunded' WHERE provider_payment_id = $1`, providerPaymentID)
	return err
}

func (r *PaymentRepo) InsertInvoice(ctx context.Context, userID uuid.UUID, providerInvoiceID, number, pdfURL string,
	amountCents int, currency string, issuedAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO invoices (user_id, provider_invoice_id, number, pdf_url, amount_cents, currency, issued_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (provider_invoice_id) DO NOTHING`,
		userID, providerInvoiceID, number, pdfURL, amountCents, currency, issuedAt)
	return err
}

/* ── Webhook-Events ──────────────────────────────────────────────────────── */

type WebhookRepo struct{ pool *pgxpool.Pool }

func NewWebhookRepo(pool *pgxpool.Pool) *WebhookRepo { return &WebhookRepo{pool} }

func (r *WebhookRepo) InsertEvent(ctx context.Context, provider, providerEventID, eventType string, payload []byte) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO webhook_events (provider, provider_event_id, type, payload)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (provider_event_id) DO NOTHING`,
		provider, providerEventID, eventType, payload)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (r *WebhookRepo) MarkProcessed(ctx context.Context, providerEventID string, processErr error) {
	var errText *string
	if processErr != nil {
		s := processErr.Error()
		errText = &s
	}
	_, _ = r.pool.Exec(ctx, `
		UPDATE webhook_events SET processed_at = now(), error = $2 WHERE provider_event_id = $1`,
		providerEventID, errText)
}

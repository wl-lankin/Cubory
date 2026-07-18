package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// BillingPlan sind die kaufbaren Varianten.
type BillingPlan string

const (
	BillingMonthly  BillingPlan = "monthly"
	BillingYearly   BillingPlan = "yearly"
	BillingLifetime BillingPlan = "lifetime"
)

// BillingEventType ist das provider-neutrale Event-Vokabular (§4.4 der Architektur).
type BillingEventType string

const (
	EvPaymentSucceeded      BillingEventType = "payment_succeeded"
	EvPaymentFailed         BillingEventType = "payment_failed"
	EvSubscriptionCreated   BillingEventType = "subscription_created"
	EvSubscriptionUpdated   BillingEventType = "subscription_updated"
	EvSubscriptionCancelled BillingEventType = "subscription_cancelled"
	EvSubscriptionResumed   BillingEventType = "subscription_resumed"
	EvRefund                BillingEventType = "refund"
	EvLifetimePurchased     BillingEventType = "lifetime_purchased"
)

// BillingEvent ist die normalisierte Form eines Provider-Webhooks.
// Der Provider (Stripe, …) übersetzt sein Wire-Format hierhin - der
// Webhook-Service kennt nur diese Struktur.
type BillingEvent struct {
	ProviderEventID string
	Type            BillingEventType
	UserID          uuid.UUID // aus Metadata des Checkouts
	CustomerID      string
	SubscriptionID  string
	PaymentID       string
	InvoiceID       string
	InvoiceNumber   string
	InvoicePDF      string
	AmountCents     int
	Currency        string
	Interval        BillingPlan // month/year bei Abos
	PeriodEnd       *time.Time
	CancelAtEnd     bool
	RawPayload      []byte
}

// BillingProvider abstrahiert den Zahlungsanbieter. Stripe ist die erste
// Implementierung; die Signatur erlaubt den Austausch ohne Service-Änderungen.
type BillingProvider interface {
	CreateCheckout(ctx context.Context, user *User, plan BillingPlan) (url string, err error)
	CreatePortalSession(ctx context.Context, customerID string) (url string, err error)
	CancelAtPeriodEnd(ctx context.Context, subscriptionID string) error
	Resume(ctx context.Context, subscriptionID string) error
	ParseWebhook(payload []byte, signatureHeader string) (*BillingEvent, error)
}

type Subscription struct {
	ID                     uuid.UUID
	UserID                 uuid.UUID
	LicenseID              uuid.UUID
	Provider               string
	ProviderCustomerID     string
	ProviderSubscriptionID string
	Interval               string
	Status                 string
	CancelAtPeriodEnd      bool
	CurrentPeriodEnd       *time.Time
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type SubscriptionRepo interface {
	Upsert(ctx context.Context, s *Subscription) error
	ByUser(ctx context.Context, userID uuid.UUID) (*Subscription, error)
	ByProviderID(ctx context.Context, providerSubID string) (*Subscription, error)
}

type PaymentRepo interface {
	Insert(ctx context.Context, userID uuid.UUID, subscriptionID *uuid.UUID,
		providerPaymentID string, amountCents int, currency, status string, paidAt *time.Time) error
	MarkRefunded(ctx context.Context, providerPaymentID string) error
	InsertInvoice(ctx context.Context, userID uuid.UUID, providerInvoiceID, number, pdfURL string,
		amountCents int, currency string, issuedAt time.Time) error
}

type WebhookRepo interface {
	// InsertEvent gibt false zurück, wenn das Event schon existiert (Idempotenz).
	InsertEvent(ctx context.Context, provider, providerEventID, eventType string, payload []byte) (bool, error)
	MarkProcessed(ctx context.Context, providerEventID string, processErr error)
}

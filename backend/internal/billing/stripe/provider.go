// Package stripe ist die einzige Stelle im Backend, die das Stripe-SDK kennt.
package stripe

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	stripesdk "github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/billingportal/session"
	checkout "github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/subscription"
	"github.com/stripe/stripe-go/v81/webhook"

	"cubory/api/internal/domain"
)

type Config struct {
	SecretKey       string
	WebhookSecret   string
	PriceMonthly    string // Stripe Price-IDs
	PriceYearly     string
	PriceLifetime   string
	SuccessURL      string
	CancelURL       string
	PortalReturnURL string
}

type Provider struct{ cfg Config }

func New(cfg Config) *Provider {
	stripesdk.Key = cfg.SecretKey
	return &Provider{cfg: cfg}
}

func (p *Provider) CreateCheckout(_ context.Context, user *domain.User, plan domain.BillingPlan) (string, error) {
	params := &stripesdk.CheckoutSessionParams{
		SuccessURL:        stripesdk.String(p.cfg.SuccessURL),
		CancelURL:         stripesdk.String(p.cfg.CancelURL),
		CustomerEmail:     stripesdk.String(user.Email),
		ClientReferenceID: stripesdk.String(user.ID.String()),
	}
	params.AddMetadata("user_id", user.ID.String())

	switch plan {
	case domain.BillingMonthly:
		params.Mode = stripesdk.String(string(stripesdk.CheckoutSessionModeSubscription))
		params.LineItems = []*stripesdk.CheckoutSessionLineItemParams{{Price: stripesdk.String(p.cfg.PriceMonthly), Quantity: stripesdk.Int64(1)}}
		params.SubscriptionData = &stripesdk.CheckoutSessionSubscriptionDataParams{Metadata: map[string]string{"user_id": user.ID.String()}}
	case domain.BillingYearly:
		params.Mode = stripesdk.String(string(stripesdk.CheckoutSessionModeSubscription))
		params.LineItems = []*stripesdk.CheckoutSessionLineItemParams{{Price: stripesdk.String(p.cfg.PriceYearly), Quantity: stripesdk.Int64(1)}}
		params.SubscriptionData = &stripesdk.CheckoutSessionSubscriptionDataParams{Metadata: map[string]string{"user_id": user.ID.String()}}
	case domain.BillingLifetime:
		params.Mode = stripesdk.String(string(stripesdk.CheckoutSessionModePayment))
		params.LineItems = []*stripesdk.CheckoutSessionLineItemParams{{Price: stripesdk.String(p.cfg.PriceLifetime), Quantity: stripesdk.Int64(1)}}
	default:
		return "", fmt.Errorf("unbekannter Plan %q", plan)
	}

	sess, err := checkout.New(params)
	if err != nil {
		return "", err
	}
	return sess.URL, nil
}

func (p *Provider) CreatePortalSession(_ context.Context, customerID string) (string, error) {
	sess, err := session.New(&stripesdk.BillingPortalSessionParams{
		Customer:  stripesdk.String(customerID),
		ReturnURL: stripesdk.String(p.cfg.PortalReturnURL),
	})
	if err != nil {
		return "", err
	}
	return sess.URL, nil
}

func (p *Provider) CancelAtPeriodEnd(_ context.Context, subID string) error {
	_, err := subscription.Update(subID, &stripesdk.SubscriptionParams{
		CancelAtPeriodEnd: stripesdk.Bool(true),
	})
	return err
}

func (p *Provider) Resume(_ context.Context, subID string) error {
	_, err := subscription.Update(subID, &stripesdk.SubscriptionParams{
		CancelAtPeriodEnd: stripesdk.Bool(false),
	})
	return err
}

// ParseWebhook prüft die Stripe-Signatur und normalisiert das Event.
// Gibt (nil, nil) für Event-Typen zurück, die uns nicht interessieren.
func (p *Provider) ParseWebhook(payload []byte, signatureHeader string) (*domain.BillingEvent, error) {
	event, err := webhook.ConstructEvent(payload, signatureHeader, p.cfg.WebhookSecret)
	if err != nil {
		return nil, fmt.Errorf("webhook-signatur: %w", err)
	}
	ev := &domain.BillingEvent{ProviderEventID: event.ID, RawPayload: payload}

	switch event.Type {
	case "checkout.session.completed":
		var s stripesdk.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &s); err != nil {
			return nil, err
		}
		if s.Mode != stripesdk.CheckoutSessionModePayment {
			return nil, nil // Abo-Checkouts laufen über customer.subscription.created
		}
		ev.Type = domain.EvLifetimePurchased
		ev.UserID = mustUUID(s.ClientReferenceID)
		ev.CustomerID = customerID(s.Customer)
		ev.PaymentID = paymentIntentID(s.PaymentIntent)
		ev.AmountCents = int(s.AmountTotal)
		ev.Currency = string(s.Currency)

	case "customer.subscription.created":
		var sub stripesdk.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return nil, err
		}
		ev.Type = domain.EvSubscriptionCreated
		ev.UserID = mustUUID(sub.Metadata["user_id"])
		ev.CustomerID = customerID(sub.Customer)
		ev.SubscriptionID = sub.ID
		ev.Interval = intervalOf(&sub)
		ev.PeriodEnd = unixPtr(sub.CurrentPeriodEnd)

	case "customer.subscription.updated":
		var sub stripesdk.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return nil, err
		}
		ev.Type = domain.EvSubscriptionUpdated
		if prev, ok := event.Data.PreviousAttributes["cancel_at_period_end"].(bool); ok && prev && !sub.CancelAtPeriodEnd {
			ev.Type = domain.EvSubscriptionResumed
		}
		ev.SubscriptionID = sub.ID
		ev.CancelAtEnd = sub.CancelAtPeriodEnd
		ev.PeriodEnd = unixPtr(sub.CurrentPeriodEnd)

	case "customer.subscription.deleted":
		var sub stripesdk.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return nil, err
		}
		ev.Type = domain.EvSubscriptionCancelled
		ev.SubscriptionID = sub.ID

	case "invoice.paid":
		var inv stripesdk.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			return nil, err
		}
		if inv.Subscription == nil {
			return nil, nil
		}
		ev.Type = domain.EvPaymentSucceeded
		ev.SubscriptionID = inv.Subscription.ID
		ev.PaymentID = paymentIntentID(inv.PaymentIntent)
		ev.InvoiceID = inv.ID
		ev.InvoiceNumber = inv.Number
		ev.InvoicePDF = inv.InvoicePDF
		ev.AmountCents = int(inv.AmountPaid)
		ev.Currency = string(inv.Currency)
		if inv.Lines != nil && len(inv.Lines.Data) > 0 {
			ev.PeriodEnd = unixPtr(inv.Lines.Data[0].Period.End)
		}

	case "invoice.payment_failed":
		var inv stripesdk.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			return nil, err
		}
		if inv.Subscription == nil {
			return nil, nil
		}
		ev.Type = domain.EvPaymentFailed
		ev.SubscriptionID = inv.Subscription.ID

	case "charge.refunded":
		var ch stripesdk.Charge
		if err := json.Unmarshal(event.Data.Raw, &ch); err != nil {
			return nil, err
		}
		ev.Type = domain.EvRefund
		ev.PaymentID = paymentIntentID(ch.PaymentIntent)
		ev.UserID = mustUUID(ch.Metadata["user_id"])

	default:
		return nil, nil
	}
	return ev, nil
}

/* ── Helfer ──────────────────────────────────────────────────────────────── */

func mustUUID(s string) uuid.UUID {
	id, _ := uuid.Parse(s)
	return id
}

func customerID(c *stripesdk.Customer) string {
	if c == nil {
		return ""
	}
	return c.ID
}

func paymentIntentID(pi *stripesdk.PaymentIntent) string {
	if pi == nil {
		return ""
	}
	return pi.ID
}

func intervalOf(sub *stripesdk.Subscription) domain.BillingPlan {
	if sub.Items != nil && len(sub.Items.Data) > 0 && sub.Items.Data[0].Price != nil &&
		sub.Items.Data[0].Price.Recurring != nil &&
		sub.Items.Data[0].Price.Recurring.Interval == stripesdk.PriceRecurringIntervalYear {
		return domain.BillingYearly
	}
	return domain.BillingMonthly
}

func unixPtr(ts int64) *time.Time {
	if ts == 0 {
		return nil
	}
	t := time.Unix(ts, 0)
	return &t
}

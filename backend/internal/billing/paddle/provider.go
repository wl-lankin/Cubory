// Package paddle: BillingProvider für Paddle Billing (Merchant of Record).
// Bewusst ohne SDK - schlanke HTTP-Calls gegen die v2-API.
package paddle

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"cubory/api/internal/domain"
)

type Config struct {
	APIKey        string
	WebhookSecret string
	APIBase       string // https://api.paddle.com | https://sandbox-api.paddle.com
	PriceMonthly  string
	PriceYearly   string
	PriceLifetime string
	// CheckoutURL: eigene Checkout-Seite (= Default Payment Link bei Paddle).
	// Fallback, falls die Transaktion keine checkout.url zurückgibt.
	CheckoutURL string
}

type Provider struct {
	cfg  Config
	http *http.Client
}

func New(cfg Config) *Provider {
	if cfg.APIBase == "" {
		cfg.APIBase = "https://api.paddle.com"
	}
	return &Provider{cfg: cfg, http: &http.Client{Timeout: 15 * time.Second}}
}

func (p *Provider) call(ctx context.Context, method, path string, body any) (map[string]any, error) {
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			return nil, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, p.cfg.APIBase+path, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := p.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var out struct {
		Data  map[string]any `json:"data"`
		Error map[string]any `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("paddle %d: %v", res.StatusCode, out.Error)
	}
	return out.Data, nil
}

func (p *Provider) priceFor(plan domain.BillingPlan) (string, error) {
	switch plan {
	case domain.BillingMonthly:
		return p.cfg.PriceMonthly, nil
	case domain.BillingYearly:
		return p.cfg.PriceYearly, nil
	case domain.BillingLifetime:
		return p.cfg.PriceLifetime, nil
	}
	return "", fmt.Errorf("unbekannter Plan %q", plan)
}

// CreateCheckout legt eine Transaktion an; Paddle liefert die Hosted-Checkout-URL.
func (p *Provider) CreateCheckout(ctx context.Context, user *domain.User, plan domain.BillingPlan) (string, error) {
	price, err := p.priceFor(plan)
	if err != nil {
		return "", err
	}
	data, err := p.call(ctx, "POST", "/transactions", map[string]any{
		"items":       []map[string]any{{"price_id": price, "quantity": 1}},
		"custom_data": map[string]string{"user_id": user.ID.String()},
	})
	if err != nil {
		return "", err
	}
	if c, ok := data["checkout"].(map[string]any); ok {
		if u, ok := c["url"].(string); ok && u != "" {
			return u, nil
		}
	}
	// Paddle liefert die URL nur mit gesetztem Default Payment Link; sonst
	// bauen wir sie selbst aus unserer Checkout-Seite + Transaktions-ID.
	if id, ok := data["id"].(string); ok && p.cfg.CheckoutURL != "" {
		return p.cfg.CheckoutURL + "?_ptxn=" + id, nil
	}
	return "", fmt.Errorf("paddle: keine Checkout-URL (Default Payment Link im Dashboard konfigurieren)")
}

func (p *Provider) CreatePortalSession(ctx context.Context, customerID string) (string, error) {
	data, err := p.call(ctx, "POST", "/customers/"+customerID+"/portal-sessions", map[string]any{})
	if err != nil {
		return "", err
	}
	if urls, ok := data["urls"].(map[string]any); ok {
		if g, ok := urls["general"].(map[string]any); ok {
			if u, ok := g["overview"].(string); ok {
				return u, nil
			}
		}
	}
	return "", fmt.Errorf("paddle: keine Portal-URL")
}

func (p *Provider) CancelAtPeriodEnd(ctx context.Context, subID string) error {
	_, err := p.call(ctx, "POST", "/subscriptions/"+subID+"/cancel",
		map[string]any{"effective_from": "next_billing_period"})
	return err
}

func (p *Provider) Resume(ctx context.Context, subID string) error {
	_, err := p.call(ctx, "PATCH", "/subscriptions/"+subID,
		map[string]any{"scheduled_change": nil})
	return err
}

/* ── Webhooks ────────────────────────────────────────────────────────────── */

// verifySignature: Paddle-Signature "ts=...;h1=..." = HMAC-SHA256("ts:body").
func (p *Provider) verifySignature(payload []byte, header string) bool {
	var ts, h1 string
	for _, part := range strings.Split(header, ";") {
		if v, ok := strings.CutPrefix(part, "ts="); ok {
			ts = v
		}
		if v, ok := strings.CutPrefix(part, "h1="); ok {
			h1 = v
		}
	}
	if ts == "" || h1 == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(p.cfg.WebhookSecret))
	mac.Write([]byte(ts + ":"))
	mac.Write(payload)
	want, err := hex.DecodeString(h1)
	if err != nil {
		return false
	}
	return hmac.Equal(mac.Sum(nil), want)
}

type paddleEvent struct {
	EventID   string          `json:"event_id"`
	EventType string          `json:"event_type"`
	Data      json.RawMessage `json:"data"`
}

func str(m map[string]any, keys ...string) string {
	var cur any = m
	for _, k := range keys {
		mm, ok := cur.(map[string]any)
		if !ok {
			return ""
		}
		cur = mm[k]
	}
	s, _ := cur.(string)
	return s
}

func (p *Provider) ParseWebhook(payload []byte, signatureHeader string) (*domain.BillingEvent, error) {
	if !p.verifySignature(payload, signatureHeader) {
		return nil, fmt.Errorf("paddle webhook-signatur ungültig")
	}
	var pe paddleEvent
	if err := json.Unmarshal(payload, &pe); err != nil {
		return nil, err
	}
	var d map[string]any
	if err := json.Unmarshal(pe.Data, &d); err != nil {
		return nil, err
	}
	ev := &domain.BillingEvent{ProviderEventID: pe.EventID, RawPayload: payload}
	userID, _ := uuid.Parse(str(d, "custom_data", "user_id"))
	ev.UserID = userID
	parseEnd := func(keys ...string) *time.Time {
		if s := str(d, keys...); s != "" {
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				return &t
			}
		}
		return nil
	}

	switch pe.EventType {
	case "transaction.completed":
		subID := str(d, "subscription_id")
		total := 0
		if t := str(d, "details", "totals", "total"); t != "" {
			total, _ = strconv.Atoi(t)
		}
		if subID == "" {
			ev.Type = domain.EvLifetimePurchased
			ev.CustomerID = str(d, "customer_id")
			ev.PaymentID = str(d, "id")
			ev.AmountCents = total
			ev.Currency = strings.ToLower(str(d, "currency_code"))
		} else {
			ev.Type = domain.EvPaymentSucceeded
			ev.SubscriptionID = subID
			ev.PaymentID = str(d, "id")
			ev.InvoiceID = str(d, "invoice_id")
			ev.InvoiceNumber = str(d, "invoice_number")
			ev.AmountCents = total
			ev.Currency = strings.ToLower(str(d, "currency_code"))
			ev.PeriodEnd = parseEnd("billing_period", "ends_at")
		}

	case "subscription.created":
		ev.Type = domain.EvSubscriptionCreated
		ev.CustomerID = str(d, "customer_id")
		ev.SubscriptionID = str(d, "id")
		ev.Interval = domain.BillingMonthly
		if items, ok := d["items"].([]any); ok && len(items) > 0 {
			if it, ok := items[0].(map[string]any); ok {
				if str(it, "price", "billing_cycle", "interval") == "year" {
					ev.Interval = domain.BillingYearly
				}
			}
		}
		ev.PeriodEnd = parseEnd("current_billing_period", "ends_at")
		if ev.PeriodEnd == nil {
			// Bei Trial-Abos liefert Paddle die Periode teils nur unter trial_dates
			ev.PeriodEnd = parseEnd("trial_dates", "ends_at")
		}

	case "subscription.updated":
		ev.Type = domain.EvSubscriptionUpdated
		ev.SubscriptionID = str(d, "id")
		ev.CancelAtEnd = str(d, "scheduled_change", "action") == "cancel"
		ev.PeriodEnd = parseEnd("current_billing_period", "ends_at")

	case "subscription.canceled":
		ev.Type = domain.EvSubscriptionCancelled
		ev.SubscriptionID = str(d, "id")

	case "transaction.payment_failed":
		if subID := str(d, "subscription_id"); subID != "" {
			ev.Type = domain.EvPaymentFailed
			ev.SubscriptionID = subID
		} else {
			return nil, nil
		}

	case "adjustment.updated":
		if str(d, "action") == "refund" && str(d, "status") == "approved" {
			ev.Type = domain.EvRefund
			ev.PaymentID = str(d, "transaction_id")
		} else {
			return nil, nil
		}

	default:
		return nil, nil
	}
	return ev, nil
}

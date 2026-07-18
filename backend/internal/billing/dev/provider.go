// Package dev: BillingProvider für Entwicklung und Tests - keine echten
// Zahlungen, Webhooks kommen als einfache JSON-Events (ohne Signatur).
package dev

import (
	"context"
	"encoding/json"
	"fmt"

	"cubory/api/internal/domain"
)

type Provider struct{}

func New() *Provider { return &Provider{} }

func (p *Provider) CreateCheckout(_ context.Context, user *domain.User, plan domain.BillingPlan) (string, error) {
	return fmt.Sprintf("https://checkout.dev.local/%s?user=%s", plan, user.ID), nil
}

func (p *Provider) CreatePortalSession(_ context.Context, customerID string) (string, error) {
	return "https://portal.dev.local/" + customerID, nil
}

func (p *Provider) CancelAtPeriodEnd(context.Context, string) error { return nil }
func (p *Provider) Resume(context.Context, string) error            { return nil }

// ParseWebhook akzeptiert direkt serialisierte domain.BillingEvents.
func (p *Provider) ParseWebhook(payload []byte, _ string) (*domain.BillingEvent, error) {
	var ev domain.BillingEvent
	if err := json.Unmarshal(payload, &ev); err != nil {
		return nil, err
	}
	ev.RawPayload = payload
	return &ev, nil
}

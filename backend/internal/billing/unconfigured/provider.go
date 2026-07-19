// Package unconfigured: BillingProvider-Platzhalter für Deployments ohne
// Zahlungsanbieter. Alle Aufrufe scheitern kontrolliert (503 statt Absturz),
// der Rest der API - Konten, Lizenzen, Trials - läuft normal weiter.
package unconfigured

import (
	"context"
	"errors"

	"cubory/api/internal/domain"
)

// ErrNotConfigured signalisiert der HTTP-Schicht: Zahlungen sind (noch) inaktiv.
var ErrNotConfigured = errors.New("billing_not_configured")

type Provider struct{}

func New() *Provider { return &Provider{} }

func (p *Provider) CreateCheckout(context.Context, *domain.User, domain.BillingPlan) (string, error) {
	return "", ErrNotConfigured
}
func (p *Provider) CreatePortalSession(context.Context, string) (string, error) {
	return "", ErrNotConfigured
}
func (p *Provider) CancelAtPeriodEnd(context.Context, string) error { return ErrNotConfigured }
func (p *Provider) Resume(context.Context, string) error            { return ErrNotConfigured }
func (p *Provider) ParseWebhook([]byte, string) (*domain.BillingEvent, error) {
	return nil, ErrNotConfigured
}

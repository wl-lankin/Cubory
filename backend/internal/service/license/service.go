// Package license berechnet den effektiven Lizenzstatus, verwaltet Geräte-
// Aktivierungen und stellt Ed25519-signierte Lizenz-Tokens aus.
package license

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"cubory/api/internal/domain"
	"cubory/api/internal/signing"
)

// OfflineGrace: so lange bleibt ein ausgestelltes Token ohne Server-Kontakt gültig.
const OfflineGrace = 30 * 24 * time.Hour

// SubscriptionGrace: Kulanz nach Periodenende, bevor Pro → Free degradiert.
const SubscriptionGrace = 3 * 24 * time.Hour

type Service struct {
	licenses domain.LicenseRepo
	devices  domain.DeviceRepo
	users    domain.UserRepo
	audit    domain.AuditRepo
	signer   *signing.Signer
	now      func() time.Time
}

func New(licenses domain.LicenseRepo, devices domain.DeviceRepo, users domain.UserRepo,
	audit domain.AuditRepo, signer *signing.Signer) *Service {
	return &Service{licenses: licenses, devices: devices, users: users,
		audit: audit, signer: signer, now: time.Now}
}

// SetNow injiziert eine Testuhr.
func (s *Service) SetNow(now func() time.Time) { s.now = now }

/* ── Status ──────────────────────────────────────────────────────────────── */

type Status struct {
	Plan          string     `json:"plan"`
	Kind          string     `json:"kind"`
	Entitlements  []string   `json:"entitlements"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	TrialEndsAt   *time.Time `json:"trial_ends_at,omitempty"`
	TrialDaysLeft *int       `json:"trial_days_left,omitempty"`
	MaxDevices    int        `json:"max_devices"`
	DevicesUsed   int        `json:"devices_used"`
}

// Effective liefert den aktuellen Status und materialisiert dabei abgelaufene
// Trials/Abos zu Free (lazy - kein Cron nötig).
func (s *Service) Effective(ctx context.Context, userID uuid.UUID) (*Status, *domain.License, error) {
	lic, err := s.licenses.ActiveByUser(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	lic, err = s.materialize(ctx, lic)
	if err != nil {
		return nil, nil, err
	}

	plan, err := s.licenses.PlanByID(ctx, lic.PlanID)
	if err != nil {
		return nil, nil, err
	}
	ents, err := s.licenses.EntitlementsByPlan(ctx, lic.PlanID)
	if err != nil {
		return nil, nil, err
	}
	if ents == nil {
		ents = []string{}
	}
	used, err := s.devices.CountActiveByUser(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	st := &Status{
		Plan: lic.PlanID, Kind: string(lic.Kind), Entitlements: ents,
		ExpiresAt: lic.ExpiresAt, MaxDevices: plan.MaxDevices, DevicesUsed: used,
	}
	if lic.Kind == domain.KindTrial && lic.ExpiresAt != nil {
		st.TrialEndsAt = lic.ExpiresAt
		days := int(time.Until(*lic.ExpiresAt).Hours()/24) + 1
		if days < 0 {
			days = 0
		}
		st.TrialDaysLeft = &days
	}
	return st, lic, nil
}

// materialize überführt abgelaufene Lizenzen in den Free-Zustand.
func (s *Service) materialize(ctx context.Context, lic *domain.License) (*domain.License, error) {
	if lic.ExpiresAt == nil {
		return lic, nil // lifetime/free
	}
	deadline := *lic.ExpiresAt
	if lic.Kind == domain.KindMonthly || lic.Kind == domain.KindYearly {
		deadline = deadline.Add(SubscriptionGrace)
	}
	if s.now().Before(deadline) {
		return lic, nil
	}

	lic.Status = domain.LicenseExpired
	if err := s.licenses.Update(ctx, lic); err != nil {
		return nil, err
	}
	now := s.now()
	free := &domain.License{
		ID: uuid.New(), UserID: lic.UserID, PlanID: "free", Kind: domain.KindFree,
		Status: domain.LicenseActive, StartsAt: now, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.licenses.Create(ctx, free); err != nil {
		return nil, err
	}
	s.audit.Write(ctx, domain.AuditEntry{UserID: &lic.UserID, Actor: "system",
		Action: "license_downgraded_to_free", Detail: map[string]any{"from": lic.Kind}})
	return free, nil
}

/* ── Aktivierung / Heartbeat ─────────────────────────────────────────────── */

type DeviceInfo struct {
	Name        string `json:"name" binding:"required"`
	OS          string `json:"os" binding:"required"`
	Fingerprint string `json:"fingerprint" binding:"required"`
	AppVersion  string `json:"app_version" binding:"required"`
}

type TokenResponse struct {
	LicenseToken string  `json:"license_token"`
	Status       *Status `json:"status"`
}

// Activate bindet das Gerät an den Account (max_devices!) und stellt ein Token aus.
func (s *Service) Activate(ctx context.Context, userID uuid.UUID, info DeviceInfo) (*TokenResponse, error) {
	st, _, err := s.Effective(ctx, userID)
	if err != nil {
		return nil, err
	}

	existing, err := s.devices.ByUserAndFingerprint(ctx, userID, info.Fingerprint)
	isNew := err == domain.ErrNotFound || (existing != nil && existing.DeactivatedAt != nil)
	if err != nil && err != domain.ErrNotFound {
		return nil, err
	}
	if isNew && st.DevicesUsed >= st.MaxDevices {
		return nil, domain.ErrDeviceLimit
	}

	now := s.now()
	d := &domain.Device{
		ID: uuid.New(), UserID: userID, Name: info.Name, OS: info.OS,
		FingerprintHash: info.Fingerprint, AppVersion: info.AppVersion,
		ActivatedAt: now, LastSeenAt: now,
	}
	if err := s.devices.Upsert(ctx, d); err != nil {
		return nil, err
	}
	if isNew {
		s.audit.Write(ctx, domain.AuditEntry{UserID: &userID, Actor: "user",
			Action: "device_activated", Detail: map[string]any{"device_id": d.ID, "name": info.Name}})
	}
	return s.issue(ctx, userID, d.ID, info.Fingerprint)
}

// Heartbeat: tägliches Check-in - aktualisiert last_seen und rollt das Token-Fenster.
func (s *Service) Heartbeat(ctx context.Context, userID uuid.UUID, fingerprint, appVersion string) (*TokenResponse, error) {
	d, err := s.devices.ByUserAndFingerprint(ctx, userID, fingerprint)
	if err != nil {
		return nil, err
	}
	if d.DeactivatedAt != nil {
		return nil, domain.ErrNotFound // deaktiviertes Gerät bekommt kein Token
	}
	if err := s.devices.Touch(ctx, d.ID, appVersion); err != nil {
		return nil, err
	}
	return s.issue(ctx, userID, d.ID, fingerprint)
}

// Deactivate gibt einen Geräte-Slot frei (eigene Geräte only - prüft der Handler).
func (s *Service) Deactivate(ctx context.Context, userID, deviceID uuid.UUID) error {
	d, err := s.devices.ByID(ctx, deviceID)
	if err != nil {
		return err
	}
	if d.UserID != userID {
		return domain.ErrNotFound // fremde Geräte sind unsichtbar
	}
	if err := s.devices.Deactivate(ctx, deviceID); err != nil {
		return err
	}
	s.audit.Write(ctx, domain.AuditEntry{UserID: &userID, Actor: "user",
		Action: "device_deactivated", Detail: map[string]any{"device_id": deviceID}})
	return nil
}

func (s *Service) Devices(ctx context.Context, userID uuid.UUID) ([]domain.Device, error) {
	return s.devices.ActiveByUser(ctx, userID)
}

/* ── Token ───────────────────────────────────────────────────────────────── */

// TokenPayload entspricht §5 der Architektur - der Desktop-Client prüft
// Signatur, Fingerprint und valid_until.
type TokenPayload struct {
	V                int        `json:"v"`
	UserID           uuid.UUID  `json:"user_id"`
	DeviceID         uuid.UUID  `json:"device_id"`
	FingerprintHash  string     `json:"fingerprint_hash"`
	Plan             string     `json:"plan"`
	Kind             string     `json:"kind"`
	Entitlements     []string   `json:"entitlements"`
	LicenseExpiresAt *time.Time `json:"license_expires_at,omitempty"`
	IssuedAt         time.Time  `json:"issued_at"`
	ValidUntil       time.Time  `json:"valid_until"`
}

func (s *Service) issue(ctx context.Context, userID, deviceID uuid.UUID, fingerprint string) (*TokenResponse, error) {
	st, lic, err := s.Effective(ctx, userID)
	if err != nil {
		return nil, err
	}
	now := s.now()
	validUntil := now.Add(OfflineGrace)
	// Das Offline-Fenster endet nie nach der Lizenz selbst (+ Kulanz bei Abos).
	if lic.ExpiresAt != nil {
		deadline := *lic.ExpiresAt
		if lic.Kind == domain.KindMonthly || lic.Kind == domain.KindYearly {
			deadline = deadline.Add(SubscriptionGrace)
		}
		if deadline.Before(validUntil) {
			validUntil = deadline
		}
	}
	payload := TokenPayload{
		V: 1, UserID: userID, DeviceID: deviceID, FingerprintHash: fingerprint,
		Plan: st.Plan, Kind: st.Kind, Entitlements: st.Entitlements,
		LicenseExpiresAt: lic.ExpiresAt, IssuedAt: now, ValidUntil: validUntil,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &TokenResponse{LicenseToken: s.signer.Sign(raw), Status: st}, nil
}

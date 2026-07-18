// Package domain enthält die Entities und Interfaces des Kerns -
// framework-frei, keine Gin-/pgx-/Stripe-Imports.
package domain

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID              uuid.UUID
	Email           string
	EmailVerifiedAt *time.Time
	PasswordHash    string
	Name            string
	TrialStartedAt  time.Time
	TrialEndsAt     time.Time
	CreatedAt       time.Time
	LastLoginAt     *time.Time
}

type LicenseKind string

const (
	KindTrial      LicenseKind = "trial"
	KindFree       LicenseKind = "free"
	KindMonthly    LicenseKind = "monthly"
	KindYearly     LicenseKind = "yearly"
	KindLifetime   LicenseKind = "lifetime"
	KindEnterprise LicenseKind = "enterprise"
)

type LicenseStatus string

const (
	LicenseActive    LicenseStatus = "active"
	LicensePastDue   LicenseStatus = "past_due"
	LicenseCancelled LicenseStatus = "cancelled"
	LicenseExpired   LicenseStatus = "expired"
)

type License struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	PlanID    string
	Kind      LicenseKind
	Status    LicenseStatus
	StartsAt  time.Time
	ExpiresAt *time.Time // nil = lifetime/free
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Plan struct {
	ID         string
	Name       string
	MaxDevices int
}

type Device struct {
	ID              uuid.UUID
	UserID          uuid.UUID
	Name            string
	OS              string
	FingerprintHash string
	AppVersion      string
	ActivatedAt     time.Time
	LastSeenAt      time.Time
	DeactivatedAt   *time.Time
}

type Session struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	DeviceID  *uuid.UUID
	IP        string
	UserAgent string
	CreatedAt time.Time
	RevokedAt *time.Time
}

type RefreshToken struct {
	ID        uuid.UUID
	SessionID uuid.UUID
	TokenHash string
	FamilyID  uuid.UUID
	ExpiresAt time.Time
	UsedAt    *time.Time
	CreatedAt time.Time
}

type EmailTokenPurpose string

const (
	PurposeVerifyEmail   EmailTokenPurpose = "verify_email"
	PurposeResetPassword EmailTokenPurpose = "reset_password"
)

type EmailToken struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	Purpose   EmailTokenPurpose
	TokenHash string
	ExpiresAt time.Time
	UsedAt    *time.Time
}

type AuditEntry struct {
	UserID *uuid.UUID
	Actor  string // user | system | webhook | admin
	Action string
	Detail map[string]any
	IP     string
}

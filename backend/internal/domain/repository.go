package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type UserRepo interface {
	Create(ctx context.Context, u *User) error
	ByEmail(ctx context.Context, email string) (*User, error)
	ByID(ctx context.Context, id uuid.UUID) (*User, error)
	SetEmailVerified(ctx context.Context, id uuid.UUID, at time.Time) error
	SetPasswordHash(ctx context.Context, id uuid.UUID, hash string) error
	SetLastLogin(ctx context.Context, id uuid.UUID, at time.Time) error
	// Anonymize: DSGVO-Löschung - Soft-Delete + personenbezogene Felder überschreiben.
	Anonymize(ctx context.Context, id uuid.UUID) error
}

type LicenseRepo interface {
	Create(ctx context.Context, l *License) error
	ActiveByUser(ctx context.Context, userID uuid.UUID) (*License, error)
	Update(ctx context.Context, l *License) error
	PlanByID(ctx context.Context, planID string) (*Plan, error)
	EntitlementsByPlan(ctx context.Context, planID string) ([]string, error)
}

type DeviceRepo interface {
	Upsert(ctx context.Context, d *Device) error // (user_id, fingerprint) eindeutig; reaktiviert bei Konflikt
	ByID(ctx context.Context, id uuid.UUID) (*Device, error)
	ByUserAndFingerprint(ctx context.Context, userID uuid.UUID, fingerprintHash string) (*Device, error)
	ActiveByUser(ctx context.Context, userID uuid.UUID) ([]Device, error)
	CountActiveByUser(ctx context.Context, userID uuid.UUID) (int, error)
	Deactivate(ctx context.Context, id uuid.UUID) error
	Touch(ctx context.Context, id uuid.UUID, appVersion string) error
}

type SessionRepo interface {
	Create(ctx context.Context, s *Session) error
	Revoke(ctx context.Context, id uuid.UUID) error
	RevokeAllForUser(ctx context.Context, userID uuid.UUID) error
	ByID(ctx context.Context, id uuid.UUID) (*Session, error)
}

type RefreshTokenRepo interface {
	Create(ctx context.Context, t *RefreshToken) error
	ByHash(ctx context.Context, hash string) (*RefreshToken, error)
	MarkUsed(ctx context.Context, id uuid.UUID, at time.Time) error
	RevokeFamily(ctx context.Context, familyID uuid.UUID) error
}

type EmailTokenRepo interface {
	Create(ctx context.Context, t *EmailToken) error
	ByHash(ctx context.Context, hash string) (*EmailToken, error)
	// LatestActiveByUser: jüngstes unbenutztes Token eines Users für einen Zweck.
	LatestActiveByUser(ctx context.Context, userID uuid.UUID, purpose EmailTokenPurpose) (*EmailToken, error)
	IncrementAttempts(ctx context.Context, id uuid.UUID) (int, error)
	MarkUsed(ctx context.Context, id uuid.UUID, at time.Time) error
}

type AuditRepo interface {
	Write(ctx context.Context, e AuditEntry)
}

// Mailer abstrahiert den Versand; Implementierungen: SMTP, Dev-Logger.
type Mailer interface {
	Send(ctx context.Context, to, subject, textBody string) error
}

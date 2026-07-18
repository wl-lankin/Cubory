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

/* ── Sessions ────────────────────────────────────────────────────────────── */

type SessionRepo struct{ pool *pgxpool.Pool }

func NewSessionRepo(pool *pgxpool.Pool) *SessionRepo { return &SessionRepo{pool} }

func (r *SessionRepo) Create(ctx context.Context, s *domain.Session) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO sessions (id, user_id, device_id, ip, user_agent, created_at)
		VALUES ($1,$2,$3,NULLIF($4,'')::inet,$5,$6)`,
		s.ID, s.UserID, s.DeviceID, s.IP, s.UserAgent, s.CreatedAt)
	return err
}

func (r *SessionRepo) ByID(ctx context.Context, id uuid.UUID) (*domain.Session, error) {
	var s domain.Session
	var ip *string
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, device_id, ip::text, user_agent, created_at, revoked_at
		FROM sessions WHERE id = $1`, id).
		Scan(&s.ID, &s.UserID, &s.DeviceID, &ip, &s.UserAgent, &s.CreatedAt, &s.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if ip != nil {
		s.IP = *ip
	}
	return &s, err
}

func (r *SessionRepo) Revoke(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, id)
	return err
}

func (r *SessionRepo) RevokeAllForUser(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	return err
}

/* ── Refresh-Tokens ──────────────────────────────────────────────────────── */

type RefreshTokenRepo struct{ pool *pgxpool.Pool }

func NewRefreshTokenRepo(pool *pgxpool.Pool) *RefreshTokenRepo { return &RefreshTokenRepo{pool} }

func (r *RefreshTokenRepo) Create(ctx context.Context, t *domain.RefreshToken) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO refresh_tokens (id, session_id, token_hash, family_id, expires_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		t.ID, t.SessionID, t.TokenHash, t.FamilyID, t.ExpiresAt, t.CreatedAt)
	return err
}

func (r *RefreshTokenRepo) ByHash(ctx context.Context, hash string) (*domain.RefreshToken, error) {
	var t domain.RefreshToken
	err := r.pool.QueryRow(ctx, `
		SELECT id, session_id, token_hash, family_id, expires_at, used_at, created_at
		FROM refresh_tokens WHERE token_hash = $1`, hash).
		Scan(&t.ID, &t.SessionID, &t.TokenHash, &t.FamilyID, &t.ExpiresAt, &t.UsedAt, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &t, err
}

func (r *RefreshTokenRepo) MarkUsed(ctx context.Context, id uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE refresh_tokens SET used_at = $2 WHERE id = $1 AND used_at IS NULL`, id, at)
	return err
}

func (r *RefreshTokenRepo) RevokeFamily(ctx context.Context, familyID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE refresh_tokens SET used_at = COALESCE(used_at, now()), expires_at = now()
		WHERE family_id = $1`, familyID)
	return err
}

/* ── E-Mail-Tokens ───────────────────────────────────────────────────────── */

type EmailTokenRepo struct{ pool *pgxpool.Pool }

func NewEmailTokenRepo(pool *pgxpool.Pool) *EmailTokenRepo { return &EmailTokenRepo{pool} }

func (r *EmailTokenRepo) Create(ctx context.Context, t *domain.EmailToken) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at)
		VALUES ($1,$2,$3,$4,$5)`,
		t.ID, t.UserID, t.Purpose, t.TokenHash, t.ExpiresAt)
	return err
}

func (r *EmailTokenRepo) ByHash(ctx context.Context, hash string) (*domain.EmailToken, error) {
	var t domain.EmailToken
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, purpose, token_hash, expires_at, used_at
		FROM email_tokens WHERE token_hash = $1`, hash).
		Scan(&t.ID, &t.UserID, &t.Purpose, &t.TokenHash, &t.ExpiresAt, &t.UsedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &t, err
}

func (r *EmailTokenRepo) MarkUsed(ctx context.Context, id uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE email_tokens SET used_at = $2 WHERE id = $1 AND used_at IS NULL`, id, at)
	return err
}

/* ── Audit ───────────────────────────────────────────────────────────────── */

type AuditRepo struct{ pool *pgxpool.Pool }

func NewAuditRepo(pool *pgxpool.Pool) *AuditRepo { return &AuditRepo{pool} }

// Write ist bewusst fire-and-forget: Audit darf Businesslogik nie blockieren.
func (r *AuditRepo) Write(ctx context.Context, e domain.AuditEntry) {
	_, _ = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (user_id, actor, action, detail, ip)
		VALUES ($1,$2,$3,$4,NULLIF($5,'')::inet)`,
		e.UserID, e.Actor, e.Action, e.Detail, e.IP)
}

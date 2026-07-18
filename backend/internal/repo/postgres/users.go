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

type UserRepo struct{ pool *pgxpool.Pool }

func NewUserRepo(pool *pgxpool.Pool) *UserRepo { return &UserRepo{pool} }

func (r *UserRepo) Create(ctx context.Context, u *domain.User) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, name, trial_started_at, trial_ends_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		u.ID, u.Email, u.PasswordHash, u.Name, u.TrialStartedAt, u.TrialEndsAt, u.CreatedAt)
	return err
}

const userCols = `id, email, email_verified_at, password_hash, name,
	trial_started_at, trial_ends_at, created_at, last_login_at`

func (r *UserRepo) scan(row pgx.Row) (*domain.User, error) {
	var u domain.User
	err := row.Scan(&u.ID, &u.Email, &u.EmailVerifiedAt, &u.PasswordHash, &u.Name,
		&u.TrialStartedAt, &u.TrialEndsAt, &u.CreatedAt, &u.LastLoginAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &u, err
}

func (r *UserRepo) ByEmail(ctx context.Context, email string) (*domain.User, error) {
	return r.scan(r.pool.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE email = $1 AND deleted_at IS NULL`, email))
}

func (r *UserRepo) ByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	return r.scan(r.pool.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE id = $1 AND deleted_at IS NULL`, id))
}

func (r *UserRepo) SetEmailVerified(ctx context.Context, id uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET email_verified_at = $2 WHERE id = $1`, id, at)
	return err
}

func (r *UserRepo) SetPasswordHash(ctx context.Context, id uuid.UUID, hash string) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, id, hash)
	return err
}

func (r *UserRepo) SetLastLogin(ctx context.Context, id uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET last_login_at = $2 WHERE id = $1`, id, at)
	return err
}

func (r *UserRepo) Anonymize(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users SET deleted_at = now(),
			email = 'deleted-' || id || '@deleted.invalid',
			name = 'Gelöschtes Konto', password_hash = '!'
		WHERE id = $1`, id)
	return err
}

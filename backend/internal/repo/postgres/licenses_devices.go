package postgres

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"cubory/api/internal/domain"
)

/* ── Lizenzen ────────────────────────────────────────────────────────────── */

type LicenseRepo struct{ pool *pgxpool.Pool }

func NewLicenseRepo(pool *pgxpool.Pool) *LicenseRepo { return &LicenseRepo{pool} }

func (r *LicenseRepo) Create(ctx context.Context, l *domain.License) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO licenses (id, user_id, plan_id, kind, status, starts_at, expires_at, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		l.ID, l.UserID, l.PlanID, l.Kind, l.Status, l.StartsAt, l.ExpiresAt, l.CreatedAt, l.UpdatedAt)
	return err
}

func (r *LicenseRepo) ActiveByUser(ctx context.Context, userID uuid.UUID) (*domain.License, error) {
	var l domain.License
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, plan_id, kind, status, starts_at, expires_at, created_at, updated_at
		FROM licenses WHERE user_id = $1 AND status = 'active'`, userID).
		Scan(&l.ID, &l.UserID, &l.PlanID, &l.Kind, &l.Status, &l.StartsAt, &l.ExpiresAt, &l.CreatedAt, &l.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &l, err
}

func (r *LicenseRepo) Update(ctx context.Context, l *domain.License) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE licenses SET plan_id=$2, kind=$3, status=$4, expires_at=$5, updated_at=now()
		WHERE id = $1`, l.ID, l.PlanID, l.Kind, l.Status, l.ExpiresAt)
	return err
}

func (r *LicenseRepo) PlanByID(ctx context.Context, planID string) (*domain.Plan, error) {
	var p domain.Plan
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, max_devices FROM plans WHERE id = $1`, planID).
		Scan(&p.ID, &p.Name, &p.MaxDevices)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &p, err
}

func (r *LicenseRepo) EntitlementsByPlan(ctx context.Context, planID string) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT entitlement_key FROM plan_entitlements WHERE plan_id = $1 ORDER BY entitlement_key`, planID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

/* ── Geräte ──────────────────────────────────────────────────────────────── */

type DeviceRepo struct{ pool *pgxpool.Pool }

func NewDeviceRepo(pool *pgxpool.Pool) *DeviceRepo { return &DeviceRepo{pool} }

// Upsert: gleiches Gerät (user+fingerprint) wird reaktiviert und aktualisiert;
// die ID des bestehenden Datensatzes wird in d zurückgeschrieben.
func (r *DeviceRepo) Upsert(ctx context.Context, d *domain.Device) error {
	return r.pool.QueryRow(ctx, `
		INSERT INTO devices (id, user_id, name, os, fingerprint_hash, app_version, activated_at, last_seen_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (user_id, fingerprint_hash) DO UPDATE
		SET name = EXCLUDED.name, os = EXCLUDED.os, app_version = EXCLUDED.app_version,
		    last_seen_at = EXCLUDED.last_seen_at, deactivated_at = NULL
		RETURNING id`,
		d.ID, d.UserID, d.Name, d.OS, d.FingerprintHash, d.AppVersion, d.ActivatedAt, d.LastSeenAt).
		Scan(&d.ID)
}

func (r *DeviceRepo) ByID(ctx context.Context, id uuid.UUID) (*domain.Device, error) {
	return r.scanOne(r.pool.QueryRow(ctx, deviceSelect+` WHERE id = $1`, id))
}

func (r *DeviceRepo) ByUserAndFingerprint(ctx context.Context, userID uuid.UUID, fp string) (*domain.Device, error) {
	return r.scanOne(r.pool.QueryRow(ctx,
		deviceSelect+` WHERE user_id = $1 AND fingerprint_hash = $2`, userID, fp))
}

const deviceSelect = `SELECT id, user_id, name, os, fingerprint_hash, app_version,
	activated_at, last_seen_at, deactivated_at FROM devices`

func (r *DeviceRepo) scanOne(row pgx.Row) (*domain.Device, error) {
	var d domain.Device
	err := row.Scan(&d.ID, &d.UserID, &d.Name, &d.OS, &d.FingerprintHash,
		&d.AppVersion, &d.ActivatedAt, &d.LastSeenAt, &d.DeactivatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &d, err
}

func (r *DeviceRepo) ActiveByUser(ctx context.Context, userID uuid.UUID) ([]domain.Device, error) {
	rows, err := r.pool.Query(ctx,
		deviceSelect+` WHERE user_id = $1 AND deactivated_at IS NULL ORDER BY last_seen_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Device
	for rows.Next() {
		var d domain.Device
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.OS, &d.FingerprintHash,
			&d.AppVersion, &d.ActivatedAt, &d.LastSeenAt, &d.DeactivatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *DeviceRepo) CountActiveByUser(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM devices WHERE user_id = $1 AND deactivated_at IS NULL`, userID).Scan(&n)
	return n, err
}

func (r *DeviceRepo) Deactivate(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE devices SET deactivated_at = now() WHERE id = $1 AND deactivated_at IS NULL`, id)
	return err
}

func (r *DeviceRepo) Touch(ctx context.Context, id uuid.UUID, appVersion string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE devices SET last_seen_at = now(), app_version = $2 WHERE id = $1`, id, appVersion)
	return err
}

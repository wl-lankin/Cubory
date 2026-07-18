package license_test

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"cubory/api/internal/domain"
	"cubory/api/internal/repo/postgres"
	"cubory/api/internal/service/auth"
	"cubory/api/internal/service/license"
	"cubory/api/internal/signing"
)

const testDBURL = "postgres://localhost:5432/cubory_test?sslmode=disable"

type nullMailer struct{}

func (nullMailer) Send(context.Context, string, string, string) error { return nil }

func setup(t *testing.T) (*license.Service, *auth.Service, *signing.Signer, *pgxpool.Pool) {
	t.Helper()
	if os.Getenv("CUBORY_SKIP_DB_TESTS") != "" {
		t.Skip("DB-Tests deaktiviert")
	}
	if err := postgres.Migrate(testDBURL); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	pool, err := postgres.Connect(context.Background(), testDBURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(context.Background(), `TRUNCATE users, licenses, subscriptions, payments,
		invoices, devices, sessions, refresh_tokens, email_tokens, webhook_events, audit_logs CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	users := postgres.NewUserRepo(pool)
	licenses := postgres.NewLicenseRepo(pool)
	devices := postgres.NewDeviceRepo(pool)
	audit := postgres.NewAuditRepo(pool)
	signer := signing.DevDeterministic([]byte("test"))

	licSvc := license.New(licenses, devices, users, audit, signer)
	authSvc := auth.New(auth.Config{
		JWTSecret: []byte("test"), AccessTokenTTL: time.Minute,
		RefreshTokenTTL: time.Hour, TrialDays: 7, AppBaseURL: "http://t",
	}, users, licenses, postgres.NewSessionRepo(pool), postgres.NewRefreshTokenRepo(pool),
		postgres.NewEmailTokenRepo(pool), devices, audit, nullMailer{})
	return licSvc, authSvc, signer, pool
}

func device(n string) license.DeviceInfo {
	return license.DeviceInfo{Name: n, OS: "macOS 15", Fingerprint: "fp-" + n, AppVersion: "1.0.0"}
}

func TestTrialStatusAndToken(t *testing.T) {
	licSvc, authSvc, signer, _ := setup(t)
	ctx := context.Background()
	user, _, err := authSvc.Register(ctx, "W", "trial@test.de", "sehr-sicher-123", "")
	if err != nil {
		t.Fatal(err)
	}

	resp, err := licSvc.Activate(ctx, user.ID, device("mbp"))
	if err != nil {
		t.Fatalf("activate: %v", err)
	}
	if resp.Status.Kind != "trial" || resp.Status.Plan != "pro" {
		t.Errorf("status = %s/%s, want trial/pro", resp.Status.Kind, resp.Status.Plan)
	}
	if len(resp.Status.Entitlements) == 0 {
		t.Error("Trial muss Pro-Entitlements haben")
	}
	if resp.Status.TrialDaysLeft == nil || *resp.Status.TrialDaysLeft != 7 {
		t.Errorf("trial_days_left = %v, want 7", resp.Status.TrialDaysLeft)
	}

	// Token: Signatur prüfen wie der Desktop-Client
	payload, ok := signing.Verify(signer.PublicKey(), resp.LicenseToken)
	if !ok {
		t.Fatal("Token-Signatur ungültig")
	}
	var p license.TokenPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		t.Fatal(err)
	}
	if p.FingerprintHash != "fp-mbp" || p.Plan != "pro" {
		t.Errorf("payload falsch: %+v", p)
	}
	// Offline-Fenster endet mit dem Trial, nicht nach 30 Tagen
	if !p.ValidUntil.Equal(*p.LicenseExpiresAt) {
		t.Errorf("valid_until = %v, want trial end %v", p.ValidUntil, p.LicenseExpiresAt)
	}

	// manipuliertes Token fällt durch
	if _, ok := signing.Verify(signer.PublicKey(), resp.LicenseToken[:len(resp.LicenseToken)-2]+"xx"); ok {
		t.Error("manipuliertes Token wurde akzeptiert")
	}
}

func TestTrialExpiresToFree(t *testing.T) {
	licSvc, authSvc, _, _ := setup(t)
	ctx := context.Background()
	user, _, err := authSvc.Register(ctx, "W", "expire@test.de", "sehr-sicher-123", "")
	if err != nil {
		t.Fatal(err)
	}

	// Uhr 8 Tage vorstellen → Trial vorbei
	licSvc.SetNow(func() time.Time { return time.Now().Add(8 * 24 * time.Hour) })

	st, _, err := licSvc.Effective(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if st.Kind != "free" || st.Plan != "free" {
		t.Errorf("status nach Ablauf = %s/%s, want free/free", st.Kind, st.Plan)
	}
	if len(st.Entitlements) != 0 {
		t.Errorf("Free hat keine Pro-Entitlements, got %v", st.Entitlements)
	}

	// Idempotent: zweiter Aufruf bleibt free (keine doppelte Materialisierung)
	st2, _, err := licSvc.Effective(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if st2.Kind != "free" {
		t.Errorf("zweiter Aufruf = %s, want free", st2.Kind)
	}
}

func TestDeviceLimit(t *testing.T) {
	licSvc, authSvc, _, _ := setup(t)
	ctx := context.Background()
	user, _, err := authSvc.Register(ctx, "W", "limit@test.de", "sehr-sicher-123", "")
	if err != nil {
		t.Fatal(err)
	}

	// Pro-Plan: max 3 Geräte
	for _, n := range []string{"a", "b", "c"} {
		if _, err := licSvc.Activate(ctx, user.ID, device(n)); err != nil {
			t.Fatalf("activate %s: %v", n, err)
		}
	}
	if _, err := licSvc.Activate(ctx, user.ID, device("d")); err != domain.ErrDeviceLimit {
		t.Fatalf("4. Gerät: err = %v, want ErrDeviceLimit", err)
	}
	// Re-Aktivierung eines bestehenden Geräts geht immer
	if _, err := licSvc.Activate(ctx, user.ID, device("a")); err != nil {
		t.Fatalf("re-activate: %v", err)
	}

	// Slot freigeben → neues Gerät passt wieder
	devices, _ := licSvc.Devices(ctx, user.ID)
	if err := licSvc.Deactivate(ctx, user.ID, devices[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := licSvc.Activate(ctx, user.ID, device("d")); err != nil {
		t.Fatalf("nach Freigabe: %v", err)
	}
}

func TestHeartbeatRollsWindow(t *testing.T) {
	licSvc, authSvc, signer, _ := setup(t)
	ctx := context.Background()
	user, _, err := authSvc.Register(ctx, "W", "hb@test.de", "sehr-sicher-123", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := licSvc.Activate(ctx, user.ID, device("mbp")); err != nil {
		t.Fatal(err)
	}

	resp, err := licSvc.Heartbeat(ctx, user.ID, "fp-mbp", "1.1.0")
	if err != nil {
		t.Fatalf("heartbeat: %v", err)
	}
	payload, ok := signing.Verify(signer.PublicKey(), resp.LicenseToken)
	if !ok {
		t.Fatal("Signatur ungültig")
	}
	var p license.TokenPayload
	_ = json.Unmarshal(payload, &p)
	if time.Until(p.ValidUntil) <= 0 {
		t.Error("valid_until muss in der Zukunft liegen")
	}

	// deaktiviertes Gerät bekommt kein Token mehr
	devices, _ := licSvc.Devices(ctx, user.ID)
	_ = licSvc.Deactivate(ctx, user.ID, devices[0].ID)
	if _, err := licSvc.Heartbeat(ctx, user.ID, "fp-mbp", "1.1.0"); err != domain.ErrNotFound {
		t.Errorf("heartbeat nach Deaktivierung: err = %v, want ErrNotFound", err)
	}
}

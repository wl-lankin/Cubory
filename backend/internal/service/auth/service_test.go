package auth_test

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"cubory/api/internal/domain"
	"cubory/api/internal/repo/postgres"
	"cubory/api/internal/service/auth"
)

const testDBURL = "postgres://localhost:5432/cubory_test?sslmode=disable"

// captureMailer sammelt Mails ein, damit Tests Verify-/Reset-Tokens auslesen können.
type captureMailer struct {
	mu    sync.Mutex
	mails []struct{ To, Subject, Body string }
}

func (m *captureMailer) Send(_ context.Context, msg domain.Mail) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.mails = append(m.mails, struct{ To, Subject, Body string }{msg.To, msg.Subject, msg.Text})
	return nil
}

func (m *captureMailer) lastCode(t *testing.T) string {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.mails) == 0 {
		t.Fatal("keine Mail versendet")
	}
	re := regexp.MustCompile(`\b(\d{6})\b`)
	match := re.FindStringSubmatch(m.mails[len(m.mails)-1].Body)
	if match == nil {
		t.Fatalf("kein Code in Mail: %q", m.mails[len(m.mails)-1].Body)
	}
	return match[1]
}

func (m *captureMailer) lastToken(t *testing.T) string {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.mails) == 0 {
		t.Fatal("keine Mail versendet")
	}
	body := m.mails[len(m.mails)-1].Body
	i := strings.Index(body, "token=")
	if i < 0 {
		t.Fatalf("kein Token in Mail: %q", body)
	}
	token := body[i+len("token="):]
	if j := strings.IndexAny(token, " \n"); j >= 0 {
		token = token[:j]
	}
	return token
}

func setup(t *testing.T) (*auth.Service, *captureMailer, *pgxpool.Pool) {
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
	_, err = pool.Exec(context.Background(), `TRUNCATE users, licenses, subscriptions, payments,
		invoices, devices, sessions, refresh_tokens, email_tokens, webhook_events, audit_logs CASCADE`)
	if err != nil {
		t.Fatalf("truncate: %v", err)
	}

	mailer := &captureMailer{}
	svc := auth.New(auth.Config{
		JWTSecret:       []byte("test-secret"),
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 30 * 24 * time.Hour,
		TrialDays:       7,
		AppBaseURL:      "http://test.local",
	},
		postgres.NewUserRepo(pool), postgres.NewLicenseRepo(pool),
		postgres.NewSessionRepo(pool), postgres.NewRefreshTokenRepo(pool),
		postgres.NewEmailTokenRepo(pool), postgres.NewDeviceRepo(pool),
		postgres.NewAuditRepo(pool), mailer)
	return svc, mailer, pool
}

func TestRegisterCreatesTrial(t *testing.T) {
	svc, _, pool := setup(t)
	ctx := context.Background()

	user, tokens, err := svc.Register(ctx, "Wolfgang", "w@test.de", "sehr-sicher-123", "127.0.0.1")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if tokens.AccessToken == "" || tokens.RefreshToken == "" {
		t.Fatal("Tokens fehlen")
	}
	wantEnd := user.TrialStartedAt.Add(7 * 24 * time.Hour)
	if !user.TrialEndsAt.Equal(wantEnd) {
		t.Errorf("trial_ends_at = %v, want %v", user.TrialEndsAt, wantEnd)
	}

	lic, err := postgres.NewLicenseRepo(pool).ActiveByUser(ctx, user.ID)
	if err != nil {
		t.Fatalf("license: %v", err)
	}
	if lic.Kind != domain.KindTrial || lic.PlanID != "pro" {
		t.Errorf("license = %s/%s, want trial/pro", lic.Kind, lic.PlanID)
	}

	// doppelte Registrierung
	if _, _, err := svc.Register(ctx, "X", "w@test.de", "sehr-sicher-123", ""); err != domain.ErrEmailTaken {
		t.Errorf("duplicate register err = %v, want ErrEmailTaken", err)
	}
}

func TestLoginAndDeviceUpsert(t *testing.T) {
	svc, _, pool := setup(t)
	ctx := context.Background()
	_, _, _ = svc.Register(ctx, "W", "login@test.de", "sehr-sicher-123", "")

	device := &auth.DeviceInfo{Name: "MacBook", OS: "macOS 15", Fingerprint: "fp-abc", AppVersion: "1.0.0"}
	_, _, err := svc.Login(ctx, "login@test.de", "sehr-sicher-123", "127.0.0.1", "test-agent", device)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	// zweiter Login mit gleichem Fingerprint darf kein zweites Gerät anlegen
	_, _, err = svc.Login(ctx, "login@test.de", "sehr-sicher-123", "127.0.0.1", "test-agent", device)
	if err != nil {
		t.Fatalf("login2: %v", err)
	}
	var count int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM devices`).Scan(&count)
	if count != 1 {
		t.Errorf("devices = %d, want 1 (Upsert)", count)
	}

	if _, _, err := svc.Login(ctx, "login@test.de", "FALSCH", "", "", nil); err != domain.ErrInvalidCredentials {
		t.Errorf("wrong password err = %v, want ErrInvalidCredentials", err)
	}
	if _, _, err := svc.Login(ctx, "gibtsnicht@test.de", "x", "", "", nil); err != domain.ErrInvalidCredentials {
		t.Errorf("unknown user err = %v, want ErrInvalidCredentials", err)
	}
}

func TestRefreshRotationAndReuseDetection(t *testing.T) {
	svc, _, _ := setup(t)
	ctx := context.Background()
	_, tokens, err := svc.Register(ctx, "W", "rot@test.de", "sehr-sicher-123", "")
	if err != nil {
		t.Fatal(err)
	}

	// normale Rotation
	t2, err := svc.Refresh(ctx, tokens.RefreshToken)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if t2.RefreshToken == tokens.RefreshToken {
		t.Fatal("Refresh-Token wurde nicht rotiert")
	}

	// Reuse des alten Tokens → Familie gesperrt
	if _, err := svc.Refresh(ctx, tokens.RefreshToken); err != domain.ErrTokenReused {
		t.Fatalf("reuse err = %v, want ErrTokenReused", err)
	}
	// auch das neue Token ist jetzt wertlos
	if _, err := svc.Refresh(ctx, t2.RefreshToken); err == nil {
		t.Fatal("Familie hätte gesperrt sein müssen")
	}
}

func TestVerifyEmailAndPasswordReset(t *testing.T) {
	svc, mailer, _ := setup(t)
	ctx := context.Background()
	user, _, err := svc.Register(ctx, "W", fmt.Sprintf("mail%d@test.de", time.Now().UnixNano()), "sehr-sicher-123", "")
	if err != nil {
		t.Fatal(err)
	}

	// Verify-Mail mit Code wurde bei Registrierung verschickt
	code := mailer.lastCode(t)
	// falscher Code zählt als Versuch
	if err := svc.VerifyEmailCode(ctx, user.Email, "000000"); err == nil {
		t.Fatal("falscher Code darf nicht funktionieren")
	}
	if err := svc.VerifyEmailCode(ctx, user.Email, code); err != nil {
		t.Fatalf("verify: %v", err)
	}
	// idempotent nach Verifizierung
	if err := svc.VerifyEmailCode(ctx, user.Email, "000000"); err != nil {
		t.Fatal("nach Verifizierung muss der Aufruf idempotent sein")
	}

	// Passwort-Reset
	svc.ForgotPassword(ctx, user.Email)
	resetToken := mailer.lastToken(t)
	if err := svc.ResetPassword(ctx, resetToken, "neues-passwort-456"); err != nil {
		t.Fatalf("reset: %v", err)
	}
	if _, _, err := svc.Login(ctx, user.Email, "sehr-sicher-123", "", "", nil); err != domain.ErrInvalidCredentials {
		t.Error("altes Passwort funktioniert noch")
	}
	if _, _, err := svc.Login(ctx, user.Email, "neues-passwort-456", "", "", nil); err != nil {
		t.Errorf("neues Passwort: %v", err)
	}
}

var _ = slog.Logger{} // vermeidet unused-import bei Build-Varianten

func TestVerifyCodeAttemptLimit(t *testing.T) {
	svc, mailer, _ := setup(t)
	ctx := context.Background()
	user, _, err := svc.Register(ctx, "W", "limitcode@test.de", "sehr-sicher-123", "")
	if err != nil {
		t.Fatal(err)
	}
	code := mailer.lastCode(t)
	for i := 0; i < 5; i++ {
		_ = svc.VerifyEmailCode(ctx, user.Email, "999999")
	}
	// 6. Versuch: selbst der richtige Code ist jetzt gesperrt
	if err := svc.VerifyEmailCode(ctx, user.Email, code); err == nil {
		t.Fatal("Code muss nach 5 Fehlversuchen gesperrt sein")
	}
	// neuer Code funktioniert
	svc.ResendVerifyCode(ctx, user.Email)
	if err := svc.VerifyEmailCode(ctx, user.Email, mailer.lastCode(t)); err != nil {
		t.Fatalf("neuer Code: %v", err)
	}
}

func TestDeleteAccountRequiresPassword(t *testing.T) {
	svc, _, _ := setup(t)
	ctx := context.Background()
	user, _, err := svc.Register(ctx, "W", "del-pw@test.de", "sehr-sicher-123", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteAccount(ctx, user.ID, "falsch-falsch"); err != domain.ErrInvalidCredentials {
		t.Fatalf("falsches Passwort: err = %v, want ErrInvalidCredentials", err)
	}
	if _, _, err := svc.Login(ctx, user.Email, "sehr-sicher-123", "", "", nil); err != nil {
		t.Fatal("Konto muss nach Fehlversuch weiter existieren")
	}
	if err := svc.DeleteAccount(ctx, user.ID, "sehr-sicher-123"); err != nil {
		t.Fatalf("korrektes Passwort: %v", err)
	}
	if _, _, err := svc.Login(ctx, user.Email, "sehr-sicher-123", "", "", nil); err == nil {
		t.Fatal("gelöschtes Konto darf sich nicht anmelden")
	}
}

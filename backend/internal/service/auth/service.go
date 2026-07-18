// Package auth implementiert Registrierung, Login, Token-Rotation und
// E-Mail-Flows. Alle Abhängigkeiten kommen als Interfaces (domain) herein.
package auth

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"time"

	"github.com/google/uuid"

	"cubory/api/internal/domain"
)

type Config struct {
	JWTSecret       []byte
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	TrialDays       int
	AppBaseURL      string
}

type Service struct {
	cfg      Config
	users    domain.UserRepo
	licenses domain.LicenseRepo
	sessions domain.SessionRepo
	refresh  domain.RefreshTokenRepo
	emails   domain.EmailTokenRepo
	devices  domain.DeviceRepo
	audit    domain.AuditRepo
	mailer   domain.Mailer
	now      func() time.Time // injizierbar für Tests
}

func New(cfg Config, users domain.UserRepo, licenses domain.LicenseRepo,
	sessions domain.SessionRepo, refresh domain.RefreshTokenRepo,
	emails domain.EmailTokenRepo, devices domain.DeviceRepo,
	audit domain.AuditRepo, mailer domain.Mailer) *Service {
	return &Service{cfg: cfg, users: users, licenses: licenses, sessions: sessions,
		refresh: refresh, emails: emails, devices: devices, audit: audit,
		mailer: mailer, now: time.Now}
}

type Tokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

type DeviceInfo struct {
	Name        string `json:"name"`
	OS          string `json:"os"`
	Fingerprint string `json:"fingerprint"` // bereits gehasht vom Client
	AppVersion  string `json:"app_version"`
}

// Register legt User + Trial an. Der Trial startet serverseitig genau einmal.
func (s *Service) Register(ctx context.Context, name, email, password, ip string) (*domain.User, *Tokens, error) {
	if _, err := s.users.ByEmail(ctx, email); err == nil {
		return nil, nil, domain.ErrEmailTaken
	}
	hash, err := HashPassword(password)
	if err != nil {
		return nil, nil, err
	}
	now := s.now()
	u := &domain.User{
		ID:             uuid.New(),
		Email:          email,
		PasswordHash:   hash,
		Name:           name,
		TrialStartedAt: now,
		TrialEndsAt:    now.Add(time.Duration(s.cfg.TrialDays) * 24 * time.Hour),
		CreatedAt:      now,
	}
	if err := s.users.Create(ctx, u); err != nil {
		return nil, nil, err
	}
	trialEnd := u.TrialEndsAt
	if err := s.licenses.Create(ctx, &domain.License{
		ID: uuid.New(), UserID: u.ID, PlanID: "pro", Kind: domain.KindTrial,
		Status: domain.LicenseActive, StartsAt: now, ExpiresAt: &trialEnd,
		CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		return nil, nil, err
	}
	s.audit.Write(ctx, domain.AuditEntry{UserID: &u.ID, Actor: "user", Action: "register", IP: ip})
	s.audit.Write(ctx, domain.AuditEntry{UserID: &u.ID, Actor: "system", Action: "trial_started",
		Detail: map[string]any{"ends_at": trialEnd}})

	if err := s.sendVerifyCode(ctx, u); err != nil {
		return nil, nil, err
	}

	tokens, err := s.issueSession(ctx, u, nil, ip, "")
	if err != nil {
		return nil, nil, err
	}
	return u, tokens, nil
}

// Login prüft Credentials und registriert optional das Gerät.
func (s *Service) Login(ctx context.Context, email, password, ip, userAgent string, device *DeviceInfo) (*domain.User, *Tokens, error) {
	u, err := s.users.ByEmail(ctx, email)
	if err != nil {
		// Dummy-Verify gegen Timing-Unterschiede zwischen "User fehlt" und "Passwort falsch"
		VerifyPassword(password, "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
		return nil, nil, domain.ErrInvalidCredentials
	}
	if !VerifyPassword(password, u.PasswordHash) {
		s.audit.Write(ctx, domain.AuditEntry{UserID: &u.ID, Actor: "user", Action: "login_failed", IP: ip})
		return nil, nil, domain.ErrInvalidCredentials
	}

	var deviceID *uuid.UUID
	if device != nil {
		d := &domain.Device{
			ID: uuid.New(), UserID: u.ID, Name: device.Name, OS: device.OS,
			FingerprintHash: device.Fingerprint, AppVersion: device.AppVersion,
			ActivatedAt: s.now(), LastSeenAt: s.now(),
		}
		if err := s.devices.Upsert(ctx, d); err != nil {
			return nil, nil, err
		}
		deviceID = &d.ID
	}

	_ = s.users.SetLastLogin(ctx, u.ID, s.now())
	s.audit.Write(ctx, domain.AuditEntry{UserID: &u.ID, Actor: "user", Action: "login", IP: ip})

	tokens, err := s.issueSession(ctx, u, deviceID, ip, userAgent)
	if err != nil {
		return nil, nil, err
	}
	return u, tokens, nil
}

// Refresh rotiert das Refresh-Token. Wiederverwendung eines bereits rotierten
// Tokens sperrt die komplette Familie (Diebstahl-Indikator).
func (s *Service) Refresh(ctx context.Context, refreshToken string) (*Tokens, error) {
	t, err := s.refresh.ByHash(ctx, HashToken(refreshToken))
	if err != nil {
		return nil, domain.ErrTokenInvalid
	}
	if t.UsedAt != nil {
		_ = s.refresh.RevokeFamily(ctx, t.FamilyID)
		sess, _ := s.sessions.ByID(ctx, t.SessionID)
		if sess != nil {
			_ = s.sessions.Revoke(ctx, sess.ID)
			s.audit.Write(ctx, domain.AuditEntry{UserID: &sess.UserID, Actor: "system",
				Action: "refresh_token_reuse_detected", Detail: map[string]any{"family_id": t.FamilyID}})
		}
		return nil, domain.ErrTokenReused
	}
	if s.now().After(t.ExpiresAt) {
		return nil, domain.ErrTokenExpired
	}
	sess, err := s.sessions.ByID(ctx, t.SessionID)
	if err != nil || sess.RevokedAt != nil {
		return nil, domain.ErrTokenInvalid
	}
	if err := s.refresh.MarkUsed(ctx, t.ID, s.now()); err != nil {
		return nil, err
	}
	return s.issueTokens(ctx, sess.UserID, sess.ID, t.FamilyID)
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	t, err := s.refresh.ByHash(ctx, HashToken(refreshToken))
	if err != nil {
		return nil // Logout ist idempotent
	}
	_ = s.refresh.RevokeFamily(ctx, t.FamilyID)
	return s.sessions.Revoke(ctx, t.SessionID)
}

// ForgotPassword antwortet immer gleich (kein User-Enumeration-Leak).
func (s *Service) ForgotPassword(ctx context.Context, email string) {
	u, err := s.users.ByEmail(ctx, email)
	if err != nil {
		return
	}
	_ = s.sendEmailToken(ctx, u, domain.PurposeResetPassword,
		"Passwort zurücksetzen",
		"Setze dein Cubory-Passwort zurück:")
}

func (s *Service) ResetPassword(ctx context.Context, token, newPassword string) error {
	t, err := s.consumeEmailToken(ctx, token, domain.PurposeResetPassword)
	if err != nil {
		return err
	}
	hash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	if err := s.users.SetPasswordHash(ctx, t.UserID, hash); err != nil {
		return err
	}
	// Alle Sessions beenden - gestohlene Tokens sind damit wertlos.
	if err := s.sessions.RevokeAllForUser(ctx, t.UserID); err != nil {
		return err
	}
	s.audit.Write(ctx, domain.AuditEntry{UserID: &t.UserID, Actor: "user", Action: "password_reset"})
	return nil
}

// VerifyEmailCode prüft den 6-stelligen Code. Max. 5 Versuche pro Code,
// danach (und bei Ablauf) muss ein neuer Code angefordert werden.
func (s *Service) VerifyEmailCode(ctx context.Context, email, code string) error {
	u, err := s.users.ByEmail(ctx, email)
	if err != nil {
		return domain.ErrTokenInvalid
	}
	if u.EmailVerifiedAt != nil {
		return nil // idempotent
	}
	t, err := s.emails.LatestActiveByUser(ctx, u.ID, domain.PurposeVerifyEmail)
	if err != nil {
		return domain.ErrTokenInvalid
	}
	if s.now().After(t.ExpiresAt) {
		return domain.ErrTokenExpired
	}
	attempts, err := s.emails.IncrementAttempts(ctx, t.ID)
	if err != nil {
		return err
	}
	if attempts > 5 {
		return domain.ErrTokenInvalid
	}
	if HashToken(code) != t.TokenHash {
		return domain.ErrTokenInvalid
	}
	if err := s.emails.MarkUsed(ctx, t.ID, s.now()); err != nil {
		return err
	}
	if err := s.users.SetEmailVerified(ctx, u.ID, s.now()); err != nil {
		return err
	}
	s.audit.Write(ctx, domain.AuditEntry{UserID: &u.ID, Actor: "user", Action: "email_verified"})
	return nil
}

// ResendVerifyCode: neuer Code; antwortet nach außen immer gleich.
func (s *Service) ResendVerifyCode(ctx context.Context, email string) {
	u, err := s.users.ByEmail(ctx, email)
	if err != nil || u.EmailVerifiedAt != nil {
		return
	}
	_ = s.sendVerifyCode(ctx, u)
}

// NewVerifyCode erzeugt einen 6-stelligen Zufallscode.
func NewVerifyCode() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	n := binary.BigEndian.Uint32(b) % 1000000
	return fmt.Sprintf("%06d", n), nil
}

func (s *Service) sendVerifyCode(ctx context.Context, u *domain.User) error {
	code, err := NewVerifyCode()
	if err != nil {
		return err
	}
	if err := s.emails.Create(ctx, &domain.EmailToken{
		ID: uuid.New(), UserID: u.ID, Purpose: domain.PurposeVerifyEmail,
		TokenHash: HashToken(code), ExpiresAt: s.now().Add(30 * time.Minute),
	}); err != nil {
		return err
	}
	return s.mailer.Send(ctx, u.Email, "Dein Cubory-Bestätigungscode",
		fmt.Sprintf("Hallo %s,\n\nwillkommen bei Cubory! Dein Bestätigungscode lautet:\n\n    %s\n\nGib ihn in der App ein. Der Code ist 30 Minuten gültig.\n\nFalls du dich nicht registriert hast, ignoriere diese E-Mail.", u.Name, code))
}

/* ── intern ──────────────────────────────────────────────────────────────── */

func (s *Service) issueSession(ctx context.Context, u *domain.User, deviceID *uuid.UUID, ip, userAgent string) (*Tokens, error) {
	sess := &domain.Session{ID: uuid.New(), UserID: u.ID, DeviceID: deviceID,
		IP: ip, UserAgent: userAgent, CreatedAt: s.now()}
	if err := s.sessions.Create(ctx, sess); err != nil {
		return nil, err
	}
	return s.issueTokens(ctx, u.ID, sess.ID, uuid.New())
}

func (s *Service) issueTokens(ctx context.Context, userID, sessionID, familyID uuid.UUID) (*Tokens, error) {
	access, err := NewAccessToken(s.cfg.JWTSecret, userID, sessionID, s.cfg.AccessTokenTTL)
	if err != nil {
		return nil, err
	}
	plain, hash, err := NewOpaqueToken()
	if err != nil {
		return nil, err
	}
	if err := s.refresh.Create(ctx, &domain.RefreshToken{
		ID: uuid.New(), SessionID: sessionID, TokenHash: hash, FamilyID: familyID,
		ExpiresAt: s.now().Add(s.cfg.RefreshTokenTTL), CreatedAt: s.now(),
	}); err != nil {
		return nil, err
	}
	return &Tokens{AccessToken: access, RefreshToken: plain,
		ExpiresIn: int(s.cfg.AccessTokenTTL.Seconds())}, nil
}

func (s *Service) sendEmailToken(ctx context.Context, u *domain.User, purpose domain.EmailTokenPurpose, subject, intro string) error {
	plain, hash, err := NewOpaqueToken()
	if err != nil {
		return err
	}
	if err := s.emails.Create(ctx, &domain.EmailToken{
		ID: uuid.New(), UserID: u.ID, Purpose: purpose, TokenHash: hash,
		ExpiresAt: s.now().Add(24 * time.Hour),
	}); err != nil {
		return err
	}
	link := fmt.Sprintf("%s/%s?token=%s", s.cfg.AppBaseURL, purposePath(purpose), plain)
	return s.mailer.Send(ctx, u.Email, subject, fmt.Sprintf("Hallo %s,\n\n%s\n\n%s\n\nDer Link ist 24 Stunden gültig.", u.Name, intro, link))
}

func purposePath(p domain.EmailTokenPurpose) string {
	if p == domain.PurposeResetPassword {
		return "reset-password"
	}
	return "verify-email"
}

func (s *Service) consumeEmailToken(ctx context.Context, token string, purpose domain.EmailTokenPurpose) (*domain.EmailToken, error) {
	t, err := s.emails.ByHash(ctx, HashToken(token))
	if err != nil || t.Purpose != purpose {
		return nil, domain.ErrTokenInvalid
	}
	if t.UsedAt != nil {
		return nil, domain.ErrTokenInvalid
	}
	if s.now().After(t.ExpiresAt) {
		return nil, domain.ErrTokenExpired
	}
	if err := s.emails.MarkUsed(ctx, t.ID, s.now()); err != nil {
		return nil, err
	}
	return t, nil
}

package domain

import "errors"

// Fehler des Kerns; die HTTP-Schicht mappt sie auf Statuscodes + Fehlercodes.
var (
	ErrNotFound           = errors.New("not_found")
	ErrEmailTaken         = errors.New("email_taken")
	ErrInvalidCredentials = errors.New("invalid_credentials")
	ErrTokenInvalid       = errors.New("token_invalid")
	ErrTokenReused        = errors.New("token_reused")
	ErrTokenExpired       = errors.New("token_expired")
	ErrDeviceLimit        = errors.New("device_limit_reached")
	ErrEmailNotVerified   = errors.New("email_not_verified")
	ErrRateLimited        = errors.New("rate_limited")
)

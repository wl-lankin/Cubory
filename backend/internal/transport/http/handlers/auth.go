// Package handlers: dünne HTTP-Schicht - parsen, Service rufen, antworten.
package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"cubory/api/internal/domain"
	"cubory/api/internal/service/auth"
	"cubory/api/internal/transport/http/middleware"
)

type AuthHandler struct{ Svc *auth.Service }

type registerReq struct {
	Name     string `json:"name" binding:"required,min=1,max=120"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=10,max=200"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "Name, gültige E-Mail und Passwort (min. 10 Zeichen) erforderlich")
		return
	}
	user, tokens, err := h.Svc.Register(c.Request.Context(), req.Name, req.Email, req.Password, c.ClientIP())
	if err != nil {
		if errors.Is(err, domain.ErrEmailTaken) {
			fail(c, http.StatusConflict, "email_taken", "Diese E-Mail-Adresse ist bereits registriert")
			return
		}
		internal(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"user": publicUser(user), "tokens": tokens})
}

type loginReq struct {
	Email    string           `json:"email" binding:"required,email"`
	Password string           `json:"password" binding:"required"`
	Device   *auth.DeviceInfo `json:"device"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "E-Mail und Passwort erforderlich")
		return
	}
	user, tokens, err := h.Svc.Login(c.Request.Context(), req.Email, req.Password,
		c.ClientIP(), c.Request.UserAgent(), req.Device)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidCredentials) {
			fail(c, http.StatusUnauthorized, "invalid_credentials", "E-Mail oder Passwort falsch")
			return
		}
		internal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(user), "tokens": tokens})
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshReq
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "refresh_token erforderlich")
		return
	}
	tokens, err := h.Svc.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrTokenReused):
			fail(c, http.StatusUnauthorized, "token_reused", "Sitzung aus Sicherheitsgründen beendet - bitte neu anmelden")
		case errors.Is(err, domain.ErrTokenExpired), errors.Is(err, domain.ErrTokenInvalid):
			fail(c, http.StatusUnauthorized, "token_invalid", "Bitte neu anmelden")
		default:
			internal(c, err)
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"tokens": tokens})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	var req refreshReq
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "refresh_token erforderlich")
		return
	}
	if err := h.Svc.Logout(c.Request.Context(), req.RefreshToken); err != nil {
		internal(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "E-Mail erforderlich")
		return
	}
	h.Svc.ForgotPassword(c.Request.Context(), req.Email)
	c.Status(http.StatusAccepted) // immer 202 - kein Enumeration-Leak
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token" binding:"required"`
		Password string `json:"password" binding:"required,min=10,max=200"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "Token und neues Passwort (min. 10 Zeichen) erforderlich")
		return
	}
	if err := h.Svc.ResetPassword(c.Request.Context(), req.Token, req.Password); err != nil {
		fail(c, http.StatusBadRequest, "token_invalid", "Link ungültig oder abgelaufen")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
		Code  string `json:"code" binding:"required,len=6,numeric"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "E-Mail und 6-stelliger Code erforderlich")
		return
	}
	if err := h.Svc.VerifyEmailCode(c.Request.Context(), req.Email, req.Code); err != nil {
		if errors.Is(err, domain.ErrTokenExpired) {
			fail(c, http.StatusBadRequest, "code_expired", "Code abgelaufen - fordere einen neuen an")
			return
		}
		fail(c, http.StatusBadRequest, "code_invalid", "Code ungültig")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *AuthHandler) ResendVerification(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "E-Mail erforderlich")
		return
	}
	h.Svc.ResendVerifyCode(c.Request.Context(), req.Email)
	c.Status(http.StatusAccepted)
}

/* ── Helfer ──────────────────────────────────────────────────────────────── */

func publicUser(u *domain.User) gin.H {
	return gin.H{
		"id":             u.ID,
		"name":           u.Name,
		"email":          u.Email,
		"email_verified": u.EmailVerifiedAt != nil,
		"trial_ends_at":  u.TrialEndsAt,
		"created_at":     u.CreatedAt,
	}
}

func fail(c *gin.Context, status int, code, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"error": gin.H{
		"code": code, "message": msg, "request_id": c.GetString(middleware.CtxRequestID),
	}})
}

func internal(c *gin.Context, err error) {
	_ = c.Error(err)
	fail(c, http.StatusInternalServerError, "internal", "Interner Fehler - bitte später erneut versuchen")
}

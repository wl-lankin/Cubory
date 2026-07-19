// Package middleware: RequestID, JWT-Auth, Rate-Limiting.
package middleware

import (
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"cubory/api/internal/service/auth"
)

const (
	CtxUserID    = "user_id"
	CtxSessionID = "session_id"
	CtxRequestID = "request_id"
)

// ErrorLogger schreibt über c.Error() gemeldete Fehler ins Log - ohne das
// verschwinden 500er spurlos und Betriebsfehler sind nicht diagnostizierbar.
func ErrorLogger(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		for _, e := range c.Errors {
			log.Error("request failed",
				"method", c.Request.Method,
				"path", c.FullPath(),
				"status", c.Writer.Status(),
				"request_id", c.GetString(CtxRequestID),
				"err", e.Err.Error())
		}
	}
}

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := uuid.NewString()
		c.Set(CtxRequestID, id)
		c.Header("X-Request-Id", id)
		c.Next()
	}
}

// RequireAuth prüft den Bearer-JWT und legt User-/Session-ID in den Kontext.
func RequireAuth(secret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if raw == "" {
			abort(c, http.StatusUnauthorized, "unauthorized", "Anmeldung erforderlich")
			return
		}
		claims, err := auth.ParseAccessToken(secret, raw)
		if err != nil {
			abort(c, http.StatusUnauthorized, "token_invalid", "Token ungültig oder abgelaufen")
			return
		}
		userID, err := uuid.Parse(claims.Subject)
		if err != nil {
			abort(c, http.StatusUnauthorized, "token_invalid", "Token ungültig")
			return
		}
		c.Set(CtxUserID, userID)
		c.Set(CtxSessionID, claims.SessionID)
		c.Next()
	}
}

// RateLimit: Token-Bucket pro Schlüssel (IP oder IP+Route), In-Memory.
// Für Multi-Instanz-Deployments später gegen einen Store austauschbar.
func RateLimit(perMinute int) gin.HandlerFunc {
	type bucket struct {
		tokens float64
		last   time.Time
	}
	var mu sync.Mutex
	buckets := map[string]*bucket{}
	rate := float64(perMinute) / 60.0

	return func(c *gin.Context) {
		key := c.ClientIP() + "|" + c.FullPath()
		now := time.Now()
		mu.Lock()
		b, ok := buckets[key]
		if !ok {
			b = &bucket{tokens: float64(perMinute), last: now}
			buckets[key] = b
		}
		b.tokens = min(float64(perMinute), b.tokens+now.Sub(b.last).Seconds()*rate)
		b.last = now
		allowed := b.tokens >= 1
		if allowed {
			b.tokens--
		}
		mu.Unlock()
		if !allowed {
			c.Header("Retry-After", "60")
			abort(c, http.StatusTooManyRequests, "rate_limited", "Zu viele Anfragen - bitte kurz warten")
			return
		}
		c.Next()
	}
}

// CORS für das Customer Portal; erlaubte Origins per env (Komma-getrennt),
// dev-Fallback: alle.
func CORS() gin.HandlerFunc {
	allowed := os.Getenv("CUBORY_CORS_ORIGINS")
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && (allowed == "" || strings.Contains(allowed, origin)) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Device-Fingerprint")
			c.Header("Access-Control-Max-Age", "86400")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		c.Next()
	}
}

func abort(c *gin.Context, status int, code, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"error": gin.H{
		"code": code, "message": msg, "request_id": c.GetString(CtxRequestID),
	}})
}

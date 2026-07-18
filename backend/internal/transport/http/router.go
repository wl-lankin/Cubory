// Package http verdrahtet Router, Middleware und Handler.
package http

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"cubory/api/internal/service/auth"
	"cubory/api/internal/service/billing"
	"cubory/api/internal/service/license"
	"cubory/api/internal/transport/http/handlers"
	"cubory/api/internal/transport/http/middleware"
)

type Deps struct {
	Pool             *pgxpool.Pool
	AdminEmail       string
	JWTSecret        []byte
	Auth             *auth.Service
	License          *license.Service
	Billing          *billing.Service
	LicensePubKeyB64 string
}

func NewRouter(d Deps) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery(), middleware.RequestID(), middleware.CORS(), middleware.SecurityHeaders())

	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	api := r.Group("/api")
	ah := &handlers.AuthHandler{Svc: d.Auth}

	authGroup := api.Group("/auth")
	{
		authGroup.POST("/register", middleware.RateLimit(5), ah.Register)
		authGroup.POST("/login", middleware.RateLimit(10), ah.Login)
		authGroup.POST("/logout", ah.Logout)
		authGroup.POST("/refresh", middleware.RateLimit(30), ah.Refresh)
		authGroup.POST("/forgot-password", middleware.RateLimit(3), ah.ForgotPassword)
		authGroup.POST("/reset-password", middleware.RateLimit(5), ah.ResetPassword)
		authGroup.POST("/verify-email", middleware.RateLimit(10), ah.VerifyEmail)
		authGroup.POST("/resend-verification", middleware.RateLimit(3), ah.ResendVerification)
	}

	lh := &handlers.LicenseHandler{Svc: d.License, PublicKeyB64: d.LicensePubKeyB64}
	api.GET("/license/public-key", lh.PublicKey) // für Tooling; die App hat den Key einkompiliert

	authed := api.Group("", middleware.RequireAuth(d.JWTSecret))
	{
		authed.GET("/license/status", lh.Status)
		authed.POST("/license/activate", middleware.RateLimit(20), lh.Activate)
		authed.POST("/license/deactivate", lh.Deactivate)
		authed.POST("/license/heartbeat", middleware.RateLimit(30), lh.Heartbeat)
		authed.DELETE("/account", ah.DeleteAccount)
		authed.GET("/devices", lh.Devices)
		authed.DELETE("/devices/:id", lh.DeleteDevice)
	}

	bh := &handlers.BillingHandler{Svc: d.Billing}
	{
		authed.GET("/subscription", bh.Subscription)
		authed.POST("/subscription/create", middleware.RateLimit(10), bh.CreateCheckout)
		authed.POST("/subscription/cancel", bh.Cancel)
		authed.POST("/subscription/resume", bh.Resume)
		authed.GET("/billing/portal", bh.Portal)
	}
	api.POST("/webhooks/stripe", middleware.RateLimit(120), bh.Webhook)
	api.POST("/webhooks/paddle", middleware.RateLimit(120), bh.Webhook)

	adminH := &handlers.AdminHandler{Pool: d.Pool, AdminEmail: d.AdminEmail}
	admin := api.Group("/admin", middleware.RequireAuth(d.JWTSecret), adminH.RequireAdmin)
	{
		admin.GET("/stats", adminH.Stats)
		admin.GET("/users", adminH.Users)
		admin.GET("/users/:id", adminH.UserDetail)
		admin.POST("/users/:id/grant", adminH.Grant)
	}

	return r
}

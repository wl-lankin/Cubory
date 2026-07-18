package handlers

import (
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"cubory/api/internal/domain"
	"cubory/api/internal/service/billing"
)

type BillingHandler struct{ Svc *billing.Service }

func (h *BillingHandler) Subscription(c *gin.Context) {
	sub, err := h.Svc.Subscription(c.Request.Context(), userID(c))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.JSON(http.StatusOK, gin.H{"subscription": nil})
			return
		}
		internal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"subscription": gin.H{
		"interval":             sub.Interval,
		"status":               sub.Status,
		"cancel_at_period_end": sub.CancelAtPeriodEnd,
		"current_period_end":   sub.CurrentPeriodEnd,
	}})
}

func (h *BillingHandler) CreateCheckout(c *gin.Context) {
	var req struct {
		Plan string `json:"plan" binding:"required,oneof=monthly yearly lifetime"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "plan muss monthly, yearly oder lifetime sein")
		return
	}
	url, err := h.Svc.CreateCheckout(c.Request.Context(), userID(c), domain.BillingPlan(req.Plan))
	if err != nil {
		internal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"checkout_url": url})
}

func (h *BillingHandler) Cancel(c *gin.Context) {
	if err := h.Svc.Cancel(c.Request.Context(), userID(c)); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			fail(c, http.StatusNotFound, "no_subscription", "Kein aktives Abo vorhanden")
			return
		}
		internal(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *BillingHandler) Resume(c *gin.Context) {
	if err := h.Svc.Resume(c.Request.Context(), userID(c)); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			fail(c, http.StatusNotFound, "no_subscription", "Kein Abo vorhanden")
			return
		}
		internal(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *BillingHandler) Portal(c *gin.Context) {
	url, err := h.Svc.PortalURL(c.Request.Context(), userID(c))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			fail(c, http.StatusNotFound, "no_subscription", "Kein Abo vorhanden")
			return
		}
		internal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"portal_url": url})
}

// Webhook: unauthentifiziert, Signaturprüfung übernimmt der Provider.
func (h *BillingHandler) Webhook(c *gin.Context) {
	payload, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "Body nicht lesbar")
		return
	}
	sig := c.GetHeader("Stripe-Signature")
	if sig == "" {
		sig = c.GetHeader("Paddle-Signature")
	}
	if err := h.Svc.HandleWebhook(c.Request.Context(), payload, sig); err != nil {
		// 4xx → Stripe wiederholt nicht; Verarbeitungsfehler → 500, Stripe retried
		fail(c, http.StatusInternalServerError, "webhook_failed", err.Error())
		return
	}
	c.Status(http.StatusOK)
}

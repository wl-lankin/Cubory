package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"cubory/api/internal/domain"
	"cubory/api/internal/service/license"
	"cubory/api/internal/transport/http/middleware"
)

type LicenseHandler struct {
	Svc          *license.Service
	PublicKeyB64 string
}

func userID(c *gin.Context) uuid.UUID {
	return c.MustGet(middleware.CtxUserID).(uuid.UUID)
}

func (h *LicenseHandler) Status(c *gin.Context) {
	st, _, err := h.Svc.Effective(c.Request.Context(), userID(c))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			// z.B. gelöschtes Konto mit noch gültigem Access-Token
			fail(c, http.StatusNotFound, "no_license", "Keine aktive Lizenz")
			return
		}
		internal(c, err)
		return
	}
	c.JSON(http.StatusOK, st)
}

func (h *LicenseHandler) PublicKey(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"algorithm": "ed25519", "public_key": h.PublicKeyB64})
}

func (h *LicenseHandler) Activate(c *gin.Context) {
	var info license.DeviceInfo
	if err := c.ShouldBindJSON(&info); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "name, os, fingerprint und app_version erforderlich")
		return
	}
	resp, err := h.Svc.Activate(c.Request.Context(), userID(c), info)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			fail(c, http.StatusNotFound, "no_license", "Keine aktive Lizenz")
			return
		}
		if errors.Is(err, domain.ErrDeviceLimit) {
			fail(c, http.StatusConflict, "device_limit_reached",
				"Geräte-Limit erreicht - deaktiviere zuerst ein anderes Gerät")
			return
		}
		internal(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

type heartbeatReq struct {
	Fingerprint string `json:"fingerprint" binding:"required"`
	AppVersion  string `json:"app_version" binding:"required"`
}

func (h *LicenseHandler) Heartbeat(c *gin.Context) {
	var req heartbeatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "fingerprint und app_version erforderlich")
		return
	}
	resp, err := h.Svc.Heartbeat(c.Request.Context(), userID(c), req.Fingerprint, req.AppVersion)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			fail(c, http.StatusNotFound, "device_not_active",
				"Dieses Gerät ist nicht aktiviert - bitte neu anmelden")
			return
		}
		internal(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

type deactivateReq struct {
	DeviceID uuid.UUID `json:"device_id" binding:"required"`
}

func (h *LicenseHandler) Deactivate(c *gin.Context) {
	var req deactivateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "device_id erforderlich")
		return
	}
	if err := h.deactivate(c, req.DeviceID); err != nil {
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *LicenseHandler) Devices(c *gin.Context) {
	devices, err := h.Svc.Devices(c.Request.Context(), userID(c))
	if err != nil {
		internal(c, err)
		return
	}
	currentFP := c.GetHeader("X-Device-Fingerprint")
	out := make([]gin.H, 0, len(devices))
	for _, d := range devices {
		out = append(out, gin.H{
			"id":           d.ID,
			"name":         d.Name,
			"os":           d.OS,
			"app_version":  d.AppVersion,
			"activated_at": d.ActivatedAt,
			"last_seen_at": d.LastSeenAt,
			"current":      currentFP != "" && d.FingerprintHash == currentFP,
		})
	}
	c.JSON(http.StatusOK, gin.H{"devices": out})
}

func (h *LicenseHandler) DeleteDevice(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "Ungültige Geräte-ID")
		return
	}
	if err := h.deactivate(c, id); err != nil {
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *LicenseHandler) deactivate(c *gin.Context, id uuid.UUID) error {
	err := h.Svc.Deactivate(c.Request.Context(), userID(c), id)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			fail(c, http.StatusNotFound, "not_found", "Gerät nicht gefunden")
			return err
		}
		internal(c, err)
		return err
	}
	return nil
}

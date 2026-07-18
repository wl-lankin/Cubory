// Admin-API: Einsicht in alle Daten + kostenlose Pro-Vergabe.
// Zugriff nur für die konfigurierte Admin-E-Mail (RequireAdmin im Router).
// Bewusst mit direktem SQL statt Repos - reines Lese-/Verwaltungs-Backoffice.
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AdminHandler struct {
	Pool       *pgxpool.Pool
	AdminEmail string
}

// RequireAdmin: nach RequireAuth - lädt die E-Mail des Users und vergleicht.
func (h *AdminHandler) RequireAdmin(c *gin.Context) {
	var email string
	err := h.Pool.QueryRow(c.Request.Context(),
		`SELECT email FROM users WHERE id = $1`, userID(c)).Scan(&email)
	if err != nil || email != h.AdminEmail {
		fail(c, http.StatusForbidden, "forbidden", "Kein Admin-Zugriff")
		return
	}
	c.Next()
}

func (h *AdminHandler) Stats(c *gin.Context) {
	ctx := c.Request.Context()
	var users, pro, trial, devices, payments int
	_ = h.Pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE deleted_at IS NULL`).Scan(&users)
	_ = h.Pool.QueryRow(ctx, `SELECT count(*) FROM licenses WHERE status='active' AND kind IN ('monthly','yearly','lifetime','enterprise')`).Scan(&pro)
	_ = h.Pool.QueryRow(ctx, `SELECT count(*) FROM licenses WHERE status='active' AND kind='trial'`).Scan(&trial)
	_ = h.Pool.QueryRow(ctx, `SELECT count(*) FROM devices WHERE deactivated_at IS NULL`).Scan(&devices)
	_ = h.Pool.QueryRow(ctx, `SELECT count(*) FROM payments WHERE status='succeeded'`).Scan(&payments)
	c.JSON(200, gin.H{"users": users, "pro": pro, "trial": trial, "devices": devices, "payments": payments})
}

func (h *AdminHandler) Users(c *gin.Context) {
	rows, err := h.Pool.Query(c.Request.Context(), `
		SELECT u.id, u.name, u.email, u.email_verified_at IS NOT NULL, u.created_at, u.last_login_at,
		       COALESCE(l.kind::text,'-'), COALESCE(l.expires_at::text,''),
		       (SELECT count(*) FROM devices d WHERE d.user_id=u.id AND d.deactivated_at IS NULL)
		FROM users u
		LEFT JOIN licenses l ON l.user_id=u.id AND l.status='active'
		WHERE u.deleted_at IS NULL AND ($1 = '' OR u.email ILIKE '%'||$1||'%' OR u.name ILIKE '%'||$1||'%')
		ORDER BY u.created_at DESC LIMIT 200`, c.Query("q"))
	if err != nil {
		internal(c, err)
		return
	}
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var id uuid.UUID
		var name, email, kind, expires string
		var verified bool
		var created, lastLogin any
		var devs int
		if err := rows.Scan(&id, &name, &email, &verified, &created, &lastLogin, &kind, &expires, &devs); err != nil {
			internal(c, err)
			return
		}
		out = append(out, gin.H{"id": id, "name": name, "email": email, "verified": verified,
			"created_at": created, "last_login_at": lastLogin, "kind": kind, "expires_at": expires, "devices": devs})
	}
	c.JSON(200, gin.H{"users": out})
}

func (h *AdminHandler) UserDetail(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		fail(c, 400, "invalid_request", "Ungültige ID")
		return
	}
	ctx := c.Request.Context()
	list := func(q string) []map[string]any {
		rows, err := h.Pool.Query(ctx, q, id)
		if err != nil {
			return nil
		}
		defer rows.Close()
		var out []map[string]any
		fields := rows.FieldDescriptions()
		for rows.Next() {
			vals, _ := rows.Values()
			m := map[string]any{}
			for i, f := range fields {
				m[string(f.Name)] = vals[i]
			}
			out = append(out, m)
		}
		return out
	}
	c.JSON(200, gin.H{
		"licenses": list(`SELECT kind, status, starts_at, expires_at FROM licenses WHERE user_id=$1 ORDER BY created_at DESC`),
		"devices":  list(`SELECT name, os, app_version, last_seen_at, deactivated_at FROM devices WHERE user_id=$1 ORDER BY last_seen_at DESC`),
		"payments": list(`SELECT amount_cents, currency, status, paid_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC`),
		"audit":    list(`SELECT actor, action, created_at FROM audit_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25`),
	})
}

// Grant: kostenloses Pro (lifetime, comp) vergeben oder entziehen.
func (h *AdminHandler) Grant(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		fail(c, 400, "invalid_request", "Ungültige ID")
		return
	}
	var req struct {
		Action string `json:"action" binding:"required,oneof=grant revoke"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, "invalid_request", "action: grant | revoke")
		return
	}
	ctx := c.Request.Context()
	if _, err := h.Pool.Exec(ctx,
		`UPDATE licenses SET status='expired', updated_at=now() WHERE user_id=$1 AND status='active'`, id); err != nil {
		internal(c, err)
		return
	}
	kind, plan := "free", "free"
	if req.Action == "grant" {
		kind, plan = "lifetime", "pro"
	}
	if _, err := h.Pool.Exec(ctx, `
		INSERT INTO licenses (user_id, plan_id, kind, status) VALUES ($1,$2,$3,'active')`,
		id, plan, kind); err != nil {
		internal(c, err)
		return
	}
	adminID := userID(c)
	_, _ = h.Pool.Exec(ctx, `INSERT INTO audit_logs (user_id, actor, action, detail)
		VALUES ($1,'admin',$2, jsonb_build_object('by',$3::text))`,
		id, "admin_"+req.Action+"_pro", adminID.String())
	c.Status(http.StatusNoContent)
}

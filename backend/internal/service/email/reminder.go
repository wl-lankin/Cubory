package email

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"cubory/api/internal/domain"
)

// TrialReminder verschickt einmalig eine Mail, wenn der Trial in < 48 h endet.
// Läuft als simpler Ticker im API-Prozess; der Versand-Marker liegt in
// audit_logs (action 'trial_ending_mail'), dadurch idempotent über Restarts
// und mehrere Instanzen (INSERT vor Versand, Unique-Kandidat via NOT EXISTS).
type TrialReminder struct {
	Pool   *pgxpool.Pool
	Mailer domain.Mailer
	Log    *slog.Logger
}

func (r *TrialReminder) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		r.runOnce(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.runOnce(ctx)
			}
		}
	}()
}

func (r *TrialReminder) runOnce(ctx context.Context) {
	rows, err := r.Pool.Query(ctx, `
		SELECT u.id, u.email, u.name, u.trial_ends_at FROM users u
		WHERE u.deleted_at IS NULL
		  AND u.trial_ends_at BETWEEN now() AND now() + interval '48 hours'
		  AND EXISTS (SELECT 1 FROM licenses l WHERE l.user_id = u.id AND l.status = 'active' AND l.kind = 'trial')
		  AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.user_id = u.id AND a.action = 'trial_ending_mail')`)
	if err != nil {
		r.Log.Error("trial-reminder query", "err", err)
		return
	}
	defer rows.Close()
	type target struct {
		id, email, name string
		endsAt          time.Time
	}
	var targets []target
	for rows.Next() {
		var t target
		if err := rows.Scan(&t.id, &t.email, &t.name, &t.endsAt); err == nil {
			targets = append(targets, t)
		}
	}
	for _, u := range targets {
		// Marker zuerst - doppelte Mails sind schlimmer als eine verlorene
		tag, err := r.Pool.Exec(ctx, `
			INSERT INTO audit_logs (user_id, actor, action)
			SELECT $1, 'system', 'trial_ending_mail'
			WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE user_id = $1 AND action = 'trial_ending_mail')`, u.id)
		if err != nil || tag.RowsAffected() == 0 {
			continue
		}
		body := fmt.Sprintf("Hallo %s,\n\ndeine Cubory-Pro-Testphase endet am %s.\n"+
			"Danach wechselst du automatisch auf Cubory Free - alle Viewer-Funktionen bleiben erhalten.\n\n"+
			"Wenn du Messwerkzeuge, Schnittansichten und Export behalten möchtest, "+
			"findest du die Pro-Optionen in der App unter Konto.\n", u.name, u.endsAt.Format("02.01.2006"))
		if err := r.Mailer.Send(ctx, u.email, "Deine Cubory-Pro-Testphase endet bald", body); err != nil {
			r.Log.Error("trial-reminder send", "err", err, "to", u.email)
		}
	}
}

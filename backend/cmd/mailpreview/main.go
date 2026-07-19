// mailpreview schickt alle Mail-Vorlagen mit Beispieldaten an eine Adresse -
// zum Prüfen des Designs in echten Mail-Clients. Nutzt dieselbe Konfiguration
// wie der Server (EnvironmentFile /etc/cubory/api.env).
//
//	mailpreview info@cubory.app          # versenden
//	mailpreview --html > vorschau.html   # nur rendern (alle Mails untereinander)
package main

import (
	"context"
	"fmt"
	"os"

	"cubory/api/internal/domain"
	"cubory/api/internal/service/email"
)

func main() {
	mails := []domain.Mail{
		email.VerifyCodeMail("Wolfgang", "315012"),
		email.WelcomeMail("Wolfgang", 7),
		email.ResetPasswordMail("Wolfgang", "https://cubory.app/reset-password.html?token=beispiel"),
		email.TrialEndingMail("Wolfgang", "26.07.2026"),
	}

	if len(os.Args) > 1 && os.Args[1] == "--html" {
		for _, m := range mails {
			fmt.Printf("<!-- %s -->\n%s\n", m.Subject, m.HTML)
		}
		return
	}
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Nutzung: mailpreview <empfänger> | --html")
		os.Exit(1)
	}

	mailer := &email.SMTPMailer{
		Host: os.Getenv("CUBORY_SMTP_HOST"), Port: envOr("CUBORY_SMTP_PORT", "587"),
		User: os.Getenv("CUBORY_SMTP_USER"), Pass: os.Getenv("CUBORY_SMTP_PASS"),
		From:    envOr("CUBORY_SMTP_FROM", "Cubory <noreply@cubory.app>"),
		ReplyTo: envOr("CUBORY_SMTP_REPLY_TO", "info@cubory.app"),
	}
	for _, m := range mails {
		m.To = os.Args[1]
		m.Subject = "[Vorschau] " + m.Subject
		if err := mailer.Send(context.Background(), m); err != nil {
			fmt.Println("FEHLER:", m.Subject, err)
			os.Exit(1)
		}
		fmt.Println("gesendet:", m.Subject)
	}
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

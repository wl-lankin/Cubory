// Package email liefert Mailer-Implementierungen (domain.Mailer).
package email

import (
	"context"
	"log/slog"
	"mime"
	"net/smtp"
)

// DevMailer loggt Mails statt sie zu senden - für lokale Entwicklung.
type DevMailer struct{ Log *slog.Logger }

func (m *DevMailer) Send(_ context.Context, to, subject, textBody string) error {
	m.Log.Info("MAIL (dev)", "to", to, "subject", subject, "body", textBody)
	return nil
}

// SMTPMailer versendet über einen klassischen SMTP-Relay (STARTTLS + Auth).
type SMTPMailer struct {
	Host, Port, User, Pass, From string
}

func (m *SMTPMailer) Send(_ context.Context, to, subject, textBody string) error {
	msg := []byte("From: " + m.From + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\n" +
		"MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" +
		textBody)
	auth := smtp.PlainAuth("", m.User, m.Pass, m.Host)
	return smtp.SendMail(m.Host+":"+m.Port, auth, m.From, []string{to}, msg)
}

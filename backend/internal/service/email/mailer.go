// Package email liefert Mailer-Implementierungen (domain.Mailer).
package email

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"mime"
	"net/mail"
	"net/smtp"
	"strings"

	"cubory/api/internal/domain"
)

// Mail ist die Nachricht aus dem Kern - Alias für kurze Templates.
type Mail = domain.Mail

// DevMailer loggt Mails statt sie zu senden - für lokale Entwicklung.
type DevMailer struct{ Log *slog.Logger }

func (m *DevMailer) Send(_ context.Context, msg domain.Mail) error {
	m.Log.Info("MAIL (dev)", "to", msg.To, "subject", msg.Subject, "body", msg.Text)
	return nil
}

// SMTPMailer versendet über einen klassischen SMTP-Relay (STARTTLS + Auth).
type SMTPMailer struct {
	Host, Port, User, Pass, From string
	ReplyTo                      string // Antworten sollen einen Menschen erreichen
}

func (m *SMTPMailer) Send(_ context.Context, msg domain.Mail) error {
	// Envelope-Absender muss die nackte Adresse sein - "Name <a@b>" lehnen
	// Mailserver ab; im From-Header bleibt der Anzeigename erhalten.
	envelope := m.From
	if addr, err := mail.ParseAddress(m.From); err == nil {
		envelope = addr.Address
	}
	head := "From: " + m.From + "\r\n" +
		"To: " + msg.To + "\r\n" +
		"Subject: " + mime.QEncoding.Encode("utf-8", msg.Subject) + "\r\n"
	if m.ReplyTo != "" {
		head += "Reply-To: " + m.ReplyTo + "\r\n"
	}
	head += "MIME-Version: 1.0\r\n"

	var body string
	if msg.HTML == "" {
		body = "Content-Type: text/plain; charset=utf-8\r\n\r\n" + msg.Text
	} else {
		// multipart/alternative: Clients ohne HTML zeigen den Textteil.
		b := make([]byte, 12)
		_, _ = rand.Read(b)
		boundary := "cubory-" + hex.EncodeToString(b)
		var sb strings.Builder
		sb.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n\r\n")
		sb.WriteString("--" + boundary + "\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n")
		sb.WriteString(msg.Text + "\r\n")
		sb.WriteString("--" + boundary + "\r\nContent-Type: text/html; charset=utf-8\r\n\r\n")
		sb.WriteString(msg.HTML + "\r\n")
		sb.WriteString("--" + boundary + "--\r\n")
		body = sb.String()
	}
	auth := smtp.PlainAuth("", m.User, m.Pass, m.Host)
	return smtp.SendMail(m.Host+":"+m.Port, auth, envelope, []string{msg.To}, []byte(head+body))
}

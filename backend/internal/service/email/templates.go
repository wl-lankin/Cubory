package email

import (
	"fmt"
	"html"
	"strings"
)

// HTML-Mails im Cubory-Design. Bewusst tabellenbasiert mit Inline-Styles -
// Mail-Clients unterstützen weder externe Stylesheets noch moderne Layouts
// zuverlässig. Jede Mail wird zusätzlich als Text versendet (multipart), damit
// sie auch ohne HTML und bei blockierten Bildern vollständig lesbar bleibt.

const (
	colBG     = "#070b22"
	colCard   = "#0f1533"
	colBorder = "#2a3260"
	colText   = "#eef0ff"
	colMuted  = "#9aa3d0"
	colFaint  = "#5d668f"
	colAccent = "#ff3d8a"
	siteURL   = "https://cubory.app"
)

type mailContent struct {
	Label     string // Monospace-Kennung wie auf den Zeichnungsblättern
	Heading   string
	Intro     string
	CodeBlock string // optional: großer Bestätigungscode
	CTAText   string // optional: Button
	CTAURL    string
	Note      string // Kleingedrucktes über dem Footer
}

func render(c mailContent) string {
	esc := html.EscapeString
	var body strings.Builder

	body.WriteString(fmt.Sprintf(`<tr><td style="padding:0 0 6px;font:600 11px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.2em;color:%s">%s</td></tr>`,
		colFaint, esc(c.Label)))
	body.WriteString(fmt.Sprintf(`<tr><td style="padding:0 0 14px;font:700 22px 'Helvetica Neue',Arial,sans-serif;color:%s">%s</td></tr>`,
		colText, esc(c.Heading)))
	body.WriteString(fmt.Sprintf(`<tr><td style="padding:0 0 22px;font:400 15px/1.7 'Helvetica Neue',Arial,sans-serif;color:%s">%s</td></tr>`,
		colMuted, c.Intro))

	if c.CodeBlock != "" {
		body.WriteString(fmt.Sprintf(`<tr><td style="padding:0 0 22px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%%">
        <tr><td align="center" bgcolor="#141b40" style="border:1px solid %s;border-radius:12px;padding:22px 10px;
          font:700 34px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.34em;color:%s">%s</td></tr>
      </table></td></tr>`, colBorder, colText, esc(c.CodeBlock)))
	}

	if c.CTAText != "" {
		// Button als Tabelle mit Volltonfarbe - Verläufe rendern viele Clients nicht.
		body.WriteString(fmt.Sprintf(`<tr><td style="padding:0 0 24px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" bgcolor="%s" style="border-radius:999px">
          <a href="%s" style="display:inline-block;padding:14px 30px;font:600 15px 'Helvetica Neue',Arial,sans-serif;
            color:#ffffff;text-decoration:none;border-radius:999px">%s</a>
        </td></tr></table></td></tr>`, colAccent, c.CTAURL, esc(c.CTAText)))
	}

	if c.Note != "" {
		body.WriteString(fmt.Sprintf(`<tr><td style="padding:0 0 4px;font:400 13px/1.65 'Helvetica Neue',Arial,sans-serif;color:%s">%s</td></tr>`,
			colFaint, c.Note))
	}

	return fmt.Sprintf(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:%s">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%%" style="background:%s;padding:34px 16px">
<tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%%" style="max-width:520px">
    <tr><td style="padding:0 0 22px" align="center">
      <img src="%s/assets/icon.png" width="40" height="40" alt="" style="border-radius:10px;vertical-align:middle">
      <span style="font:700 20px 'Helvetica Neue',Arial,sans-serif;color:%s;vertical-align:middle;padding-left:10px">Cubory</span>
    </td></tr>
    <tr><td bgcolor="%s" style="border:1px solid %s;border-radius:16px;padding:32px 30px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%%">%s</table>
    </td></tr>
    <tr><td style="padding:20px 6px 0;font:400 12px/1.7 'Helvetica Neue',Arial,sans-serif;color:%s" align="center">
      Cubory - The modern CAD viewer<br>
      <a href="%s/impressum.html" style="color:%s;text-decoration:none">Impressum</a> &middot;
      <a href="%s/datenschutz.html" style="color:%s;text-decoration:none">Datenschutz</a><br>
      <span style="color:%s">Diese Nachricht wurde automatisch versendet. Antworten erreichen uns unter info@cubory.app.</span>
    </td></tr>
  </table>
</td></tr></table></body></html>`,
		colBG, colBG, siteURL, colText, colCard, colBorder, body.String(),
		colFaint, siteURL, colMuted, siteURL, colMuted, colFaint)
}

/* ── Die drei Mails ──────────────────────────────────────────────────────── */

// VerifyCodeMail: Bestätigungscode nach der Registrierung.
func VerifyCodeMail(name, code string) Mail {
	return Mail{
		Subject: "Dein Cubory-Bestätigungscode: " + code,
		Text: fmt.Sprintf("Hallo %s,\n\nwillkommen bei Cubory! Dein Bestätigungscode lautet:\n\n    %s\n\n"+
			"Gib ihn in der App ein - der Code ist 30 Minuten gültig.\n\n"+
			"Falls du dich nicht registriert hast, ignoriere diese E-Mail einfach.\n\n"+
			"Cubory - The modern CAD viewer\n%s", name, code, siteURL),
		HTML: render(mailContent{
			Label:   "KONTO · BESTÄTIGUNG",
			Heading: "Willkommen bei Cubory",
			Intro: fmt.Sprintf("Hallo %s, dein Konto ist fast fertig. Gib diesen Code in der App ein:",
				html.EscapeString(name)),
			CodeBlock: code,
			Note: "Der Code ist 30 Minuten gültig. Falls du dich nicht registriert hast, " +
				"ignoriere diese E-Mail einfach - es passiert nichts weiter.",
		}),
	}
}

// ResetPasswordMail: Link zum Setzen eines neuen Passworts.
func ResetPasswordMail(name, link string) Mail {
	return Mail{
		Subject: "Passwort zurücksetzen",
		Text: fmt.Sprintf("Hallo %s,\n\nsetze dein Cubory-Passwort über diesen Link neu:\n\n%s\n\n"+
			"Der Link ist 24 Stunden gültig. Wenn du das nicht angefordert hast, "+
			"bleibt dein aktuelles Passwort unverändert.\n\nCubory - The modern CAD viewer\n%s",
			name, link, siteURL),
		HTML: render(mailContent{
			Label:   "KONTO · PASSWORT",
			Heading: "Neues Passwort setzen",
			Intro: fmt.Sprintf("Hallo %s, du kannst hier ein neues Passwort für dein Cubory-Konto vergeben:",
				html.EscapeString(name)),
			CTAText: "Passwort neu setzen",
			CTAURL:  link,
			Note: "Der Link ist 24 Stunden gültig. Wenn du das nicht angefordert hast, " +
				"ignoriere diese E-Mail - dein Passwort bleibt unverändert.",
		}),
	}
}

// TrialEndingMail: Erinnerung kurz vor Ablauf der Pro-Testphase.
func TrialEndingMail(name, endsAt string) Mail {
	return Mail{
		Subject: "Deine Cubory-Pro-Testphase endet bald",
		Text: fmt.Sprintf("Hallo %s,\n\ndeine Pro-Testphase endet am %s.\n\n"+
			"Danach wechselt Cubory automatisch auf Free - alle Viewer-Funktionen bleiben "+
			"unbegrenzt erhalten, du verlierst nur die Pro-Werkzeuge (Messen, Schnitt, "+
			"Explosion, Export).\n\nPro behalten: %s/portal/\n\nCubory - The modern CAD viewer\n%s",
			name, endsAt, siteURL, siteURL),
		HTML: render(mailContent{
			Label:   "LIZENZ · TESTPHASE",
			Heading: "Deine Pro-Testphase endet am " + html.EscapeString(endsAt),
			Intro: fmt.Sprintf("Hallo %s, danach wechselt Cubory automatisch auf <b style=\"color:%s\">Free</b> - "+
				"alle Viewer-Funktionen bleiben unbegrenzt erhalten. Nur die Pro-Werkzeuge "+
				"(Messen, Schnittansichten, Explosionsansichten, Export) werden pausiert.",
				html.EscapeString(name), colText),
			CTAText: "Pro behalten",
			CTAURL:  siteURL + "/portal/",
			Note:    "Kein Handlungsbedarf, wenn du mit Free weiterarbeiten möchtest - Cubory bleibt nutzbar.",
		}),
	}
}

// WelcomeMail: nach bestätigter E-Mail - erklärt Trial und nächste Schritte.
func WelcomeMail(name string, trialDays int) Mail {
	return Mail{
		Subject: "Willkommen bei Cubory - 7 Tage Pro sind aktiv",
		Text: fmt.Sprintf("Hallo %s,\n\ndeine E-Mail ist bestätigt - %d Tage Cubory Pro laufen ab jetzt.\n\n"+
			"Damit kannst du:\n"+
			"  - messen (mit Einrasten auf Ecken und Kanten)\n"+
			"  - Schnittansichten entlang X/Y/Z legen\n"+
			"  - Baugruppen explodieren lassen\n"+
			"  - nach STL und SVG exportieren, HD-Screenshots erstellen\n\n"+
			"Nach der Testphase wechselst du automatisch auf Free - alle Formate, "+
			"Ansichten und Ebenen bleiben unbegrenzt nutzbar.\n\n"+
			"App laden: %s/#download\nKonto verwalten: %s/portal/\n\n"+
			"Cubory - The modern CAD viewer\n%s", name, trialDays, siteURL, siteURL, siteURL),
		HTML: render(mailContent{
			Label:   "KONTO · WILLKOMMEN",
			Heading: "Willkommen bei Cubory",
			Intro: fmt.Sprintf("Hallo %s, deine E-Mail ist bestätigt - <b style=\"color:%s\">%d Tage Cubory Pro</b> "+
				"laufen ab jetzt. Damit stehen dir alle Werkzeuge offen:"+
				"<br><br>&nbsp;&nbsp;Messen mit Einrasten auf Ecken und Kanten"+
				"<br>&nbsp;&nbsp;Schnittansichten entlang X, Y und Z"+
				"<br>&nbsp;&nbsp;Explosionsansichten für Baugruppen"+
				"<br>&nbsp;&nbsp;Export nach STL und SVG, HD-Screenshots",
				html.EscapeString(name), colText, trialDays),
			CTAText: "Cubory laden",
			CTAURL:  siteURL + "/#download",
			Note: "Nach der Testphase wechselst du automatisch auf Free - alle Formate, " +
				"Ansichten und Ebenen bleiben unbegrenzt nutzbar. Kein Abo, keine Kündigung nötig.",
		}),
	}
}

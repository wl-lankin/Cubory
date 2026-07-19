# Deployment (Produktion)

Server: `91.98.161.167` (Debian 13, 2 vCPU, 3,8 GB RAM) · Domains: cubory.app, www, api

## Aufbau

| Komponente | Ort |
|---|---|
| API-Binary | `/usr/local/bin/cubory-api` (systemd: `cubory-api.service`, lauscht auf 127.0.0.1:8880) |
| Konfiguration/Secrets | `/etc/cubory/api.env` (chmod 600, root:cubory) |
| Datenbank | PostgreSQL 17, DB + Rolle `cubory`, Migrationen laufen beim Start |
| Website/Portal/Admin | `/var/www/cubory` (nginx, statisch) |
| Downloads/Update-Feed | `/var/www/cubory/downloads` |
| TLS | Let's Encrypt via certbot, Auto-Erneuerung aktiv |
| Firewall | ufw: 22, 80, 443 |

## Neue API-Version ausrollen

```bash
cd backend
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o /tmp/cubory-api-linux ./cmd/api
scp /tmp/cubory-api-linux root@91.98.161.167:/usr/local/bin/cubory-api.new
ssh root@91.98.161.167 'mv /usr/local/bin/cubory-api.new /usr/local/bin/cubory-api && \
  chmod 755 /usr/local/bin/cubory-api && systemctl restart cubory-api && systemctl is-active cubory-api'
```

## Website aktualisieren

```bash
rsync -az --delete --exclude 'downloads/*' website/ root@91.98.161.167:/var/www/cubory/
ssh root@91.98.161.167 'chown -R www-data:www-data /var/www/cubory'
```

## Neue App-Version veröffentlichen (inkl. OTA)

```bash
# Version in package.json erhöhen
npm run dist && npm run release:publish
rsync -az website/downloads/ root@91.98.161.167:/var/www/cubory/downloads/
ssh root@91.98.161.167 'chown -R www-data:www-data /var/www/cubory/downloads'
```
Installierte Apps ziehen das Update über `https://cubory.app/downloads` (latest*.yml).

## Lizenz-Signierschlüssel

Der Ed25519-Seed liegt in `/etc/cubory/api.env` (`CUBORY_LICENSE_SIGNING_SEED`).
Der zugehörige **Public Key** ist in `electron/services/accountManager.cjs`
einkompiliert: `NWH1G+2gyBog5d39DqKReAmkfZyUtyCPkkdAGbBmT68=`

Wird der Seed getauscht, verlieren alle ausgelieferten Apps die Lizenzprüfung -
dann muss der neue Public Key in die App und ein Update ausgerollt werden.
Backup des Seeds ist Pflicht.

## E-Mail (aktiv)

Versand über Strato: `smtp.strato.de:587` (STARTTLS), Absender
`Cubory <noreply@cubory.app>`, Reply-To `info@cubory.app`.
Zugangsdaten in `/etc/cubory/api.env`.

Vier Vorlagen (HTML im App-Design + Textteil, `internal/service/email/templates.go`):
Bestätigungscode, Willkommen (nach Verifizierung), Passwort-Reset,
Trial-Ende-Erinnerung.

Design prüfen ohne echte Registrierung:

```bash
ssh root@91.98.161.167 'set -a && . /etc/cubory/api.env && set +a && cubory-mailpreview <adresse>'
go run ./cmd/mailpreview --html > vorschau.html   # lokal im Browser ansehen
```

## Paddle

- Client-side Token liegt öffentlich in `website/checkout/paddle-config.js`.
- **Default payment link** im Paddle-Dashboard: `https://cubory.app/checkout/`
- Server-seitig fehlen noch (in `/etc/cubory/api.env`):
  `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_MONTHLY|YEARLY|LIFETIME`.
  Webhook-Ziel im Dashboard: `https://api.cubory.app/api/webhooks/paddle`
  (Events: transaction.completed, transaction.payment_failed,
  subscription.created/updated/canceled, adjustment.updated).

## Caching (nginx)

HTML, `.js` und die Update-Feeds (`.yml`) werden mit `no-cache` ausgeliefert -
sonst sehen Besucher nach einem Deployment veraltete Seiten. Nur `/assets/`
(Bilder, Fonts) und `/downloads/` werden lange gecacht.

## Noch offen

- **Backups**: `pg_dump` per Cron einrichten.
- **macOS-Signatur**: für Gatekeeper-freien Start und automatisches OTA.

## CI/CD: Rollout beim Merge nach main

`.github/workflows/release.yml` übernimmt den kompletten Rollout, sobald etwas
auf `main` landet (also beim Merge von `dev`). Gearbeitet wird auf dem Branch
`dev`, `main` ist der Auslieferungsstand.

Die Pipeline baut nur, was sich geändert hat:

| Änderung an          | Folge                                                        |
|----------------------|--------------------------------------------------------------|
| `src/`, `electron/`, `assets/`, `package.json` | Installer für macOS, Windows und Linux bauen und nach `/var/www/cubory/downloads/` laden |
| `website/`           | `rsync` nach `/var/www/cubory/` (Downloads bleiben unberührt) |
| `backend/`           | `go test`, Linux-Binary bauen, ausrollen mit Health-Prüfung   |

Details, die leicht Ärger machen:

- **Installer zuerst, Metadaten danach.** `latest*.yml` wird bewusst getrennt
  hochgeladen, sonst meldet electron-updater eine Version, deren Datei noch
  gar nicht vollständig auf dem Server liegt.
- **Ohne Versionserhöhung kein OTA-Update.** Die Pipeline lädt trotzdem hoch,
  schreibt aber eine Warnung in die Job-Zusammenfassung. Version steht in
  `package.json`.
- **Der API-Rollout rollt selbst zurück.** `/usr/local/sbin/cubory-deploy-api`
  sichert die laufende Binary, startet neu, prüft 20 Sekunden lang `/healthz`
  und stellt bei Fehlschlag die vorige Version wieder her.
- **macOS-Builds sind unsigniert** (`CSC_IDENTITY_AUTO_DISCOVERY: false`).
  Bis ein Apple-Zertifikat vorliegt, greift in der App der manuelle
  Update-Hinweis statt der automatischen Installation.
- **macOS-Runner kosten das Zehnfache** an Actions-Minuten. Deshalb der
  Pfadfilter: Website-Änderungen lösen keinen App-Build aus.

### Einmalige Einrichtung auf dem Server

Der Rollout läuft über einen eigenen `deploy`-Nutzer, nicht über root. Er darf
ins Webroot schreiben und genau ein Skript per sudo starten:

```bash
scp deploy/setup-deploy-user.sh deploy/cubory-deploy-api root@91.98.161.167:/tmp/
ssh root@91.98.161.167 'bash /tmp/setup-deploy-user.sh "<öffentlicher Deploy-Schlüssel>"'
```

Die passenden GitHub-Secrets (`DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`) sind im
Repository hinterlegt. Der Hostschlüssel liegt fest im Secret, damit die
Pipeline nicht blind jeden Server akzeptiert, der gerade antwortet.

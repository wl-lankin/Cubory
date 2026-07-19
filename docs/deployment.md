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

## Noch offen

- **SMTP** (`CUBORY_SMTP_HOST/PORT/USER/PASS/FROM` in api.env): ohne das werden
  Bestätigungscodes nur ins Journal geschrieben (`journalctl -u cubory-api`).
- **Paddle** (`PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_*`):
  ohne das antworten Kauf-Endpoints mit 503, alles andere läuft.
- **Backups**: `pg_dump` per Cron einrichten.
- **macOS-Signatur**: für Gatekeeper-freien Start und automatisches OTA.

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

## Tests

`npm test` läuft in unter einer Sekunde und deckt das ab, was in diesem Projekt
schon einmal still kaputtgegangen ist:

| Datei                  | Prüft                                                      |
|------------------------|------------------------------------------------------------|
| `test/loaders.test.js` | Jedes Format über `loadCadFile()`, inklusive der drei echten Regressionen: DXF aus LibreDWG mit fehlendem Gruppencode, 3MF mit Production Extension, aufgehelltes Blau, das nicht ins Violette kippt |
| `test/formats.test.js` | Die fünf Stellen, an denen Formate stehen (Loader, erlaubte Endungen, Dateidialog, Dateizuordnungen, Website), stimmen überein |
| `test/i18n.test.js`    | Alle 20 Sprachen haben dieselben Schlüssel und behalten ihre Platzhalter |
| `test/website.test.js` | Feed-Auswertung inklusive Dateinamen mit Leerzeichen, interne Links und Sprungmarken zeigen nicht ins Leere |

`npm run test:e2e` startet zusätzlich die gebaute App über Playwright, öffnet je
eine Datei pro Format und prüft Statusanzeige, Ebenen, Teile und Reiter. Dieser
Test fängt Dinge, die Unit-Tests nicht sehen können - etwa den Fall, dass der
Renderer sein CSS nie bekommt und die App rohes HTML anzeigt.

Testdateien liegen nicht als Binärdateien im Repo, sondern werden in
`test/fixtures.js` erzeugt. Neben jeder steht, welchen Fehlerfall sie abbildet.

### In der Pipeline

`test` läuft bei jedem Push auf `dev` und `main` sowie in Pull Requests, und
zwar **vor** Build und Rollout: schlagen Tests fehl, wird nichts gebaut und
nichts hochgeladen. Der Rauchtest der App und die Go-Tests laufen nur, wenn sich
`src/`, `electron/` beziehungsweise `backend/` geändert haben.

Nützlich beim Ändern eines Regressionstests: einmal die zugehörige Korrektur im
Quelltext entfernen und prüfen, dass genau dieser Test rot wird. Ein Test, der
auch ohne den Fix besteht, schützt vor nichts.

## Sicherungen

`cubory-backup.timer` sichert täglich um 03:30 Uhr nach `/var/backups/cubory/`:

- `cubory-<Zeitstempel>.dump` - `pg_dump -Fc`, komprimiert und einzeln
  wiederherstellbar
- `api.env-<Zeitstempel>` - die Konfiguration. Sie enthält den
  Ed25519-Signierschlüssel: geht der verloren, lässt sich **keine bereits
  ausgelieferte Lizenz mehr prüfen**. Kein Datenbank-Backup hilft dann weiter.

Aufbewahrt werden 14 Tage. Verzeichnis und Dateien gehören root mit Modus 700
beziehungsweise 600 - die Sicherungen enthalten Passwort-Hashes und Schlüssel.

Ein systemd-Timer statt eines Cron-Eintrags, weil er drei Dinge mitbringt, die
hier zählen: Protokoll über `journalctl -u cubory-backup`, `Persistent=true`
holt einen Lauf nach, wenn der Server zum Zeitpunkt aus war, und der Rest des
Stacks läuft ohnehin über systemd.

### Prüfen

```bash
systemctl list-timers cubory-backup.timer   # nächster Lauf
journalctl -u cubory-backup -n 20           # letzte Läufe
systemctl start cubory-backup               # sofort sichern
```

Das Skript verwirft eine Sicherung, die sich nicht lesen lässt oder verdächtig
wenig enthält. Eine reine Größenprüfung würde einen abgebrochenen Dump
durchgehen lassen, deshalb liest es das Inhaltsverzeichnis mit `pg_restore -l`.

### Wiederherstellen

Die Sicherung gehört root, `pg_restore` läuft als `postgres` - deshalb die
Datei als root öffnen und über stdin hineinreichen. Andernfalls scheitert es an
`Permission denied`:

```bash
DUMP=$(ls -t /var/backups/cubory/*.dump | head -1)

# Erst in eine Wegwerf-Datenbank, um den Stand zu prüfen
sudo -u postgres createdb cubory_pruefung
sudo -u postgres pg_restore -d cubory_pruefung < "$DUMP"
sudo -u postgres psql -d cubory_pruefung -c 'SELECT count(*) FROM users;'
sudo -u postgres dropdb cubory_pruefung

# Ernstfall: API anhalten, Datenbank ersetzen, API starten
systemctl stop cubory-api
sudo -u postgres dropdb cubory && sudo -u postgres createdb -O cubory cubory
sudo -u postgres pg_restore -d cubory < "$DUMP"
systemctl start cubory-api
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8880/healthz
```

Verifiziert am 19.07.2026: Sicherung eingespielt, alle acht Tabellen stimmten
in der Zeilenzahl mit dem Original überein.

### Was das nicht abdeckt

Die Sicherungen liegen **auf demselben Server**. Gegen einen Ausfall der
Maschine, ein gelöschtes Verzeichnis oder einen Einbruch schützen sie nicht.
Für echten Schutz gehört eine Kopie auf ein anderes System - etwa nächtlich per
`rsync`, oder über die Snapshots des Hosters. Das ist offen.


## Suchmaschinen

Die Startseite gibt es zweimal: Deutsch unter `/`, Englisch unter `/en/`. Die
englische Fassung wird erzeugt, nicht gepflegt:

```bash
node scripts/build-en.mjs       # nach jeder Änderung an website/index.html
node scripts/build-guides.mjs   # nach jeder Änderung an scripts/guides.data.mjs
```

Die Ratgeberseiten (`dxf-datei-oeffnen.html`, `step-datei-oeffnen.html` und ihre
englischen Fassungen) entstehen aus `scripts/guides.data.mjs`. Dort steht nur
der Text, die Vorlage liegt im Erzeuger. Neue Seiten müssen zusätzlich in
`website/sitemap.xml` eingetragen und von der Startseite verlinkt werden -
sonst findet Google sie kaum.

Das Skript nimmt das Wörterbuch aus `website/translate.js` - dieselbe Datei,
aus der früher im Browser übersetzt wurde. Bleibt ein Text ohne Übersetzung,
bricht es mit einer Liste der offenen Stellen ab.

Zwei Dinge, die leicht übersehen werden:

- **Nach jeder Textänderung neu erzeugen.** Sonst driften die Sprachfassungen
  auseinander. `npm test` prüft die englische Seite mit, aber nicht, ob sie
  aktuell ist.
- **Kein automatischer Sprachwechsel.** Früher übersetzte `translate.js` die
  deutsche Seite im Browser. Googlebot surft mit en-US und hätte unter der
  deutschen Adresse englischen Inhalt gesehen, in Konkurrenz zur eigenen
  englischen Seite. Jetzt bleibt jede Adresse bei ihrer Sprache, und Besucher
  mit fremdsprachigem Browser bekommen nur einen wegklickbaren Hinweis.

`robots.txt` sperrt Portal, Admin, Checkout und den Download-Ordner; diese
Seiten tragen zusätzlich `noindex`, weil ein Ausschluss in robots.txt das
Indexieren einer verlinkten Adresse nicht verhindert.

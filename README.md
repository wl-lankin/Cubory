# Cubory - The modern CAD viewer

Desktop-Viewer für CAD-Dateien - für macOS und Windows. Öffnet 2D-Zeichnungen (DXF) und 3D-Modelle (STEP, STP, IGES, STL, OBJ) direkt lokal, ohne Server und ohne Internetverbindung.

![Startbildschirm](docs/screenshot-start.png)

![Viewer mit STEP-Baugruppe](docs/screenshot-viewer.png)

## Unterstützte Formate

| Format | Typ | Parser |
|---|---|---|
| DXF | 2D-Zeichnung | `dxf` (JS) - Splines, Bögen, Bulge-Polylinien, Blöcke/INSERT |
| STEP / STP | 3D-Volumenmodell | OpenCascade als WebAssembly (`occt-import-js`) |
| IGES / IGS | 3D | OpenCascade (WASM) |
| BREP | 3D | OpenCascade (WASM) |
| STL | 3D-Mesh | three.js STLLoader |
| OBJ | 3D-Mesh | three.js OBJLoader |

## Funktionen

- Öffnen per Dialog, Drag & Drop oder Doppelklick im Finder/Explorer (Dateiverknüpfungen sind registriert)
- 3D: Drehen, Zoomen, Verschieben; Ansichten Iso/Oben/Vorne/Rechts; Drahtgitter, Kantenlinien, Raster
- 2D (DXF): Ebenen mit Original-Farben ein- und ausblenden
- Baugruppen: Teileliste mit Original-Namen; Klick auf ein Teil isoliert es (Rest wird durchsichtig, Ansicht zoomt darauf), der Punkt daneben blendet es ein/aus; doppelte Namen werden durchnummeriert
- Modell-Info: Abmessungen in mm, Elemente bzw. Dreiecke, Dateigröße
- 20 Sprachen, Standard ist die Systemsprache (Umschalter in der Titelleiste)

## Tastatur & Maus

| Eingabe | Aktion |
|---|---|
| `Cmd/Strg + O` | Datei öffnen |
| `F` | Ansicht einpassen |
| Linke Maustaste | Drehen (3D) / Verschieben (2D) |
| Rechte Maustaste | Verschieben |
| Mausrad | Zoom |

## Installation

Fertige Installer liegen nach dem Build in `release/`:

- `Cubory-1.0.0-arm64.dmg` - macOS (Apple Silicon)
- `Cubory-1.0.0.dmg` - macOS (Intel)
- `Cubory Setup 1.0.0.exe` - Windows (64-bit)

Die Builds sind nicht code-signiert: macOS-Gatekeeper bzw. Windows SmartScreen zeigen beim ersten Start eine Warnung, die sich über „Trotzdem öffnen" bestätigen lässt.

## Sprachen

Die UI gibt es in 20 Sprachen: en, de, fr, es, it, pt, nl, pl, sv, da, no, fi, cs, sk, hu, ro, el, bg, hr, uk (gleiche Liste wie im Nexa-Projekt). Standard ist die Systemsprache; die Auswahl wird lokal gespeichert.

Englisch (`src/strings/en.js`) ist die Quelle, Deutsch (`src/strings/de.js`) ist handgepflegt. Alle anderen Sprachdateien werden lokal mit Ollama und `mistral-small` generiert - gleiches Vorgehen wie in der Nexa-App:

```bash
ollama serve                                 # falls nicht schon aktiv
node scripts/translate-locales.mjs           # alle Sprachen, nur fehlende Schlüssel
node scripts/translate-locales.mjs fr        # einzelne Sprache
node scripts/translate-locales.mjs --rework  # Review-Durchlauf über alle Übersetzungen
```

Das Skript ist idempotent (vorhandene Übersetzungen bleiben stehen), validiert Platzhalter wie `{n}` und fällt bei fehlenden Schlüsseln auf Englisch zurück.

## Entwicklung

Voraussetzung: Node.js ≥ 20.

```bash
npm install
npm start          # Renderer bauen + Electron starten
npm run dev        # Vite-Devserver (Renderer im Browser, ohne Electron-APIs)
```

## Installer bauen

```bash
npm run dist       # macOS + Windows
npm run dist:mac   # nur DMG (arm64 + x64)
npm run dist:win   # nur NSIS-Installer (x64)
```

## Projektstruktur

```
electron/          Hauptprozess (main.cjs) und Preload-Bridge (preload.cjs)
src/main.js        UI-Logik, Datei öffnen, Sprachumschalter
src/viewer.js      three.js-Szene: Kamera, Licht, Raster, Ansichten, Teil-Isolation
src/loaders.js     DXF-, STEP/IGES/BREP-, STL- und OBJ-Import
src/i18n.js        Sprachauswahl und t()-Funktion
src/strings/       en.js (Quelle), de.js (handgepflegt), Rest generiert
scripts/           translate-locales.mjs (Ollama-Übersetzung)
docs/              Screenshots
release/           fertige Installer (nach npm run dist)
```

## Lizenz-System

Architektur: [docs/licensing-architecture.md](docs/licensing-architecture.md).
Umgesetzt: Go/Gin-Backend (`backend/`), Electron-Integration, Customer Portal (`portal/index.html`).

- **Konten & Trial**: Registrierung legt serverseitig 7 Tage Cubory Pro an (nicht zurücksetzbar), danach automatisch Free - die App bleibt immer voll benutzbar
- **Lizenzen**: Trial / Free / Pro (monthly, yearly, lifetime; Enterprise vorbereitet); Entitlements als Daten, App fragt nur `can('measurements')`
- **Offline**: Ed25519-signierte Lizenz-Tokens mit rollierendem 30-Tage-Fenster, gerätegebunden; Schutz gegen Zurückstellen der Uhr
- **Geräte**: Limit pro Plan, Verwaltung in App und Portal
- **Billing**: Stripe hinter `BillingProvider`-Interface (Dev-Provider ohne Keys), Webhooks idempotent
- **Free-Dialog**: dezenter Upgrade-Hinweis, maximal einmal alle 24 h

```bash
cd backend
make db-create   # PostgreSQL-Datenbanken anlegen (einmalig)
make run         # API auf :8880 (Migrationen laufen automatisch)
make test        # Integrationstests gegen cubory_test
```

Die App verbindet sich per `CUBORY_API_URL` (Default: https://api.cubory.app).
Stripe wird über `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` und
`STRIPE_PRICE_MONTHLY|YEARLY|LIFETIME` aktiviert; SMTP über `CUBORY_SMTP_*`.
Für Produktion sind `CUBORY_JWT_SECRET` und `CUBORY_LICENSE_SIGNING_SEED`
Pflicht; der zugehörige Public Key muss in
`electron/services/accountManager.cjs` eingetragen werden.

## Technik

Electron + Vite, three.js für die Darstellung, OpenCascade (WASM) für STEP/IGES/BREP, das `dxf`-npm-Paket für DXF. Hintergrundbild und App-Icon wurden mit Higgsfield generiert. Für automatisierte UI-Tests lädt der Hook `window.__openPath(pfad)` eine Datei; mit der Umgebungsvariable `CUBORY_TEST_USERDATA` nutzt eine Test-Instanz ein eigenes Profil und kollidiert nicht mit einer laufenden App.

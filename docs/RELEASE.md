# Release und automatische Updates

Cubory prüft beim Start und danach alle vier Stunden die GitHub-Releases von `wl-lankin/Cubory` (electron-updater, Provider `github`). Gesehen werden nur veröffentlichte Releases, keine Entwürfe.

- **Windows und Linux:** Das Update lädt im Hintergrund. Danach erscheint „Neu starten“; sonst wird es beim Beenden installiert.
- **macOS:** Die App ist nicht signiert, deshalb kann sie sich nicht selbst austauschen. Cubory liest `latest-mac.yml` und bietet die passende DMG zum Download an.

## Aufbau

| Teil | Wo |
|---|---|
| Updater | `electron/services/updateManager.cjs`, Banner in `src/main.js` |
| Update-Quelle | `package.json`, `build.publish` |
| Pipeline | `.github/workflows/release.yml` (Tag), `.github/workflows/ci.yml` (Tests) |
| Release-Text | Eintrag der Version in `src/changelog.js`, über `scripts/release-notes.mjs` |

## Dateien im Release

| Datei | Zweck |
|---|---|
| `Cubory-X.Y.Z-arm64.dmg`, `Cubory-X.Y.Z.dmg` | macOS Apple Silicon und Intel |
| `Cubory-Setup-X.Y.Z.exe` | Windows-Installer, auch für den Updater |
| `Cubory-X.Y.Z.AppImage` | Linux |
| `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, `*.blockmap` | Metadaten für electron-updater |
| `Cubory-macOS-AppleSilicon.dmg`, `Cubory-macOS-Intel.dmg`, `Cubory-Windows-Setup.exe`, `Cubory-Linux.AppImage` | dieselben Installer unter festem Namen |

Feste Links für die Website:

- https://github.com/wl-lankin/Cubory/releases/latest/download/Cubory-macOS-AppleSilicon.dmg
- https://github.com/wl-lankin/Cubory/releases/latest/download/Cubory-macOS-Intel.dmg
- https://github.com/wl-lankin/Cubory/releases/latest/download/Cubory-Windows-Setup.exe
- https://github.com/wl-lankin/Cubory/releases/latest/download/Cubory-Linux.AppImage

## Ein Release erstellen

1. Version in `package.json` erhöhen (`npm version X.Y.Z --no-git-tag-version`).
2. Oben in `src/changelog.js` einen Eintrag für die Version ergänzen. `test/changelog.test.js` besteht darauf.
3. Committen, nach `main` bringen, CI muss grün sein.
4. Tag setzen und pushen:
   ```bash
   git tag -a v2.0.0 -m "Cubory 2.0.0"
   git push origin v2.0.0
   ```
   Der Tag muss zur Version in `package.json` passen, sonst bricht die Pipeline ab. Ein Tag mit Bindestrich (`v2.1.0-beta.1`) wird als Vorabversion markiert.
5. Lauf „Release“ unter Actions abwarten (macOS, Windows und Linux parallel, danach der Entwurf).
6. Entwurf prüfen und veröffentlichen:
   ```bash
   gh release edit v2.0.0 --draft=false --latest
   ```
   Erst dann sehen installierte Apps das Update.

## Secrets

- `CUBORY_CORE_KEY`: Deploy-Key mit Lesezugriff auf das private Repo `wl-lankin/cubory-core`.
- Für das Release selbst reicht der eingebaute `GITHUB_TOKEN`.

## Einschränkungen

- TODO Apple-Notarisierung: Die DMG ist nicht signiert. Beim ersten Öffnen: Systemeinstellungen, Datenschutz und Sicherheit, „Trotzdem öffnen“, oder `xattr -dr com.apple.quarantine /Applications/Cubory.app`.
- TODO Windows-Signierung (Azure Artifact Signing, wie bei den anderen Apps): Bis dahin meldet sich SmartScreen beim ersten Start.
- Versionen bis 1.7.3 suchen Updates unter `https://cubory.app/downloads`. Sie finden 2.0.0 nur, wenn dort `latest.yml`, `latest-mac.yml` und `latest-linux.yml` samt Installern liegen (oder dorthin weitergeleitet wird).

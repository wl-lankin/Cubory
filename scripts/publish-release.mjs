// Kopiert die gebauten Installer + Update-Metadaten nach website/downloads/.
// Lokal landet das bei Herd unter cubory.test/downloads/, in Produktion wird
// website/ nach cubory.app deployed - derselbe Pfad dient dann als
// OTA-Update-Feed (electron-updater generic provider).
import { copyFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
const outDir = join(root, 'website', 'downloads');
mkdirSync(outDir, { recursive: true });

const wanted = /\.(dmg|exe|AppImage|blockmap|yml)$/;
const excluded = /^builder-debug/;
let count = 0;
for (const f of readdirSync(releaseDir)) {
  if (!wanted.test(f) || excluded.test(f)) continue;
  copyFileSync(join(releaseDir, f), join(outDir, f));
  console.log('→', f);
  count++;
}
console.log(count ? `${count} Dateien nach website/downloads/ kopiert` : 'Keine Release-Dateien gefunden - erst npm run dist ausführen');

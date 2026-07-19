// Tests für die Website. Der Schwerpunkt liegt auf dem, was hier schon einmal
// still kaputtgegangen ist: Downloads, die ins Leere zeigten, und Behauptungen
// über Dateiformate, die die App gar nicht öffnen konnte.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed } from '../website/feed.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'website');

const pages = readdirSync(site).filter((f) => f.endsWith('.html'));
const read = (f) => readFileSync(join(site, f), 'utf8');
const doc = (f) => new DOMParser().parseFromString(read(f), 'text/html');

describe('Update-Feed auswerten', () => {
  // Regression: Dateinamen mit Leerzeichen wurden am ersten Leerzeichen
  // abgeschnitten, worauf die Windows-Kachel dauerhaft auf "bald verfügbar"
  // stehen blieb - klicken tat schlicht nichts.
  it('liest Dateinamen mit Leerzeichen vollständig', () => {
    const { version, files } = parseFeed([
      'version: 1.5.1',
      'files:',
      '  - url: Cubory Setup 1.5.1.exe',
      '    sha512: abc==',
      '    size: 90528431',
      'path: Cubory Setup 1.5.1.exe',
    ].join('\n'));
    expect(version).toBe('1.5.1');
    expect(files).toEqual([{ url: 'Cubory Setup 1.5.1.exe', size: 90528431 }]);
  });

  it('liest mehrere Dateien mit ihren Größen', () => {
    const { files } = parseFeed([
      'version: 1.5.1',
      'files:',
      '  - url: Cubory-1.5.1-arm64.dmg',
      '    size: 112878668',
      '  - url: Cubory-1.5.1.dmg',
      '    size: 117504232',
    ].join('\n'));
    expect(files.map((f) => f.url)).toEqual(['Cubory-1.5.1-arm64.dmg', 'Cubory-1.5.1.dmg']);
    expect(files[1].size).toBe(117504232);
  });

  it('kommt mit CRLF und fehlender Version klar', () => {
    expect(parseFeed('files:\r\n  - url: x.AppImage\r\n    size: 5\r\n'))
      .toEqual({ version: '', files: [{ url: 'x.AppImage', size: 5 }] });
  });

  it('liefert bei Unsinn leere Werte statt zu werfen', () => {
    expect(parseFeed('<html>404</html>')).toEqual({ version: '', files: [] });
  });
});

describe('Verlinkung', () => {
  it.each(pages)('%s: interne Links zeigen auf vorhandene Dateien', (page) => {
    const hrefs = [...doc(page).querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && !/^(https?:|mailto:|tel:|#|javascript:)/.test(h));
    for (const href of hrefs) {
      const [path] = href.split(/[#?]/); // Query und Sprungmarke gehören nicht zum Pfad
      if (!path) continue;
      const target = path.startsWith('/') ? join(site, path) : join(site, dirname(page), path);
      const ok = existsSync(target) || existsSync(join(target, 'index.html'));
      expect(ok, `${page}: "${href}" zeigt ins Leere`).toBe(true);
    }
  });

  it.each(pages)('%s: Skripte und Bilder sind vorhanden', (page) => {
    const srcs = [...doc(page).querySelectorAll('script[src], img[src], link[rel="stylesheet"]')]
      .map((n) => n.getAttribute('src') || n.getAttribute('href'))
      .filter((s) => s && !/^(https?:|data:)/.test(s));
    for (const src of srcs) {
      const target = src.startsWith('/') ? join(site, src) : join(site, dirname(page), src);
      expect(existsSync(target), `${page}: "${src}" fehlt`).toBe(true);
    }
  });

  it.each(pages)('%s: Sprungmarken existieren auf der Seite', (page) => {
    const d = doc(page);
    const anchors = [...d.querySelectorAll('a[href^="#"]')]
      .map((a) => a.getAttribute('href').slice(1))
      .filter((id) => id && id !== 'top');
    for (const id of anchors) {
      expect(d.getElementById(id), `${page}: Sprungmarke #${id} fehlt`).not.toBeNull();
    }
  });
});

describe('Rechtliches', () => {
  // Paddle verlangt für die Domain-Freigabe eine erreichbare Widerrufsregelung.
  it('AGB enthalten den verlinkten Widerrufsabschnitt', () => {
    expect(doc('agb.html').getElementById('widerruf')).not.toBeNull();
  });

  it('Impressum und Datenschutz sind von der Startseite erreichbar', () => {
    const hrefs = [...doc('index.html').querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'));
    for (const seite of ['impressum.html', 'datenschutz.html', 'agb.html']) {
      expect(hrefs.some((h) => h?.includes(seite)), `${seite} nicht verlinkt`).toBe(true);
    }
  });
});

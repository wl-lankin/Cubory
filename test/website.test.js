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

// Auch Unterordner: die englische Fassung liegt unter en/index.html und wäre
// sonst ungeprüft - genau die Seite, deren Pfade beim Erzeugen leicht brechen.
const pages = [
  ...readdirSync(site).filter((f) => f.endsWith('.html')),
  ...readdirSync(site, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(site, e.name, 'index.html')))
    .map((e) => `${e.name}/index.html`),
];
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

describe('Suchmaschinen', () => {
  it('robots.txt verweist auf die Sitemap und sperrt die Kundenbereiche', () => {
    const robots = readFileSync(join(site, 'robots.txt'), 'utf8');
    expect(robots).toMatch(/Sitemap:\s*https:\/\/cubory\.app\/sitemap\.xml/);
    for (const pfad of ['/portal/', '/admin/', '/checkout/']) {
      expect(robots).toContain(`Disallow: ${pfad}`);
    }
  });

  it('jede Adresse aus der Sitemap ist auch wirklich vorhanden', () => {
    const xml = readFileSync(join(site, 'sitemap.xml'), 'utf8');
    const adressen = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(adressen.length).toBeGreaterThan(1);
    for (const adresse of adressen) {
      const pfad = adresse.replace('https://cubory.app', '') || '/';
      const ziel = pfad.endsWith('/') ? join(site, pfad, 'index.html') : join(site, pfad);
      expect(existsSync(ziel), `${adresse} zeigt ins Leere`).toBe(true);
    }
  });

  it('nichts steht gleichzeitig in der Sitemap und auf noindex', () => {
    const xml = readFileSync(join(site, 'sitemap.xml'), 'utf8');
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const pfad = m[1].replace('https://cubory.app', '') || '/';
      const ziel = pfad.endsWith('/') ? join(site, pfad, 'index.html') : join(site, pfad);
      expect(readFileSync(ziel, 'utf8'), `${m[1]} ist auf noindex`).not.toMatch(/content="noindex/);
    }
  });

  it('Startseite und englische Fassung verweisen wechselseitig aufeinander', () => {
    for (const seite of ['index.html', 'en/index.html']) {
      const html = readFileSync(join(site, seite), 'utf8');
      expect(html, `${seite}: hreflang de fehlt`).toMatch(/hreflang="de" href="https:\/\/cubory\.app\/"/);
      expect(html, `${seite}: hreflang en fehlt`).toMatch(/hreflang="en" href="https:\/\/cubory\.app\/en\/"/);
    }
  });

  it('jede indexierbare Seite hat genau eine canonical-Adresse', () => {
    for (const seite of pages) {
      const html = readFileSync(join(site, seite), 'utf8');
      if (/content="noindex/.test(html)) continue;
      const treffer = [...html.matchAll(/rel="canonical"/g)];
      expect(treffer.length, `${seite}: ${treffer.length} canonical-Angaben`).toBe(1);
    }
  });

  it('die strukturierten Daten sind gültiges JSON und beschreiben die App', () => {
    const html = readFileSync(join(site, 'index.html'), 'utf8');
    const roh = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(roh, 'keine strukturierten Daten gefunden').not.toBeNull();
    const daten = JSON.parse(roh[1]);
    const typen = daten['@graph'].map((e) => e['@type']);
    expect(typen).toContain('SoftwareApplication');
    expect(typen).toContain('FAQPage');
  });

  it('jede Antwort der strukturierten FAQ steht auch sichtbar auf der Seite', () => {
    // Google verlangt, dass ausgezeichnete Inhalte sichtbar sind. Weichen sie
    // ab, gilt das als Irreführung und kann die Auszeichnung kosten.
    const html = readFileSync(join(site, 'index.html'), 'utf8');
    const daten = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    const faq = daten['@graph'].find((e) => e['@type'] === 'FAQPage');
    for (const frage of faq.mainEntity) {
      expect(html, `Frage fehlt im Markup: ${frage.name}`).toContain(frage.name);
      expect(html, `Antwort fehlt im Markup: ${frage.name}`).toContain(frage.acceptedAnswer.text);
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

// Unterstützte Dateiformate stehen an fünf Stellen: im Loader, in der Liste
// erlaubter Endungen des Hauptprozesses, im Dateidialog, in den
// Dateizuordnungen des Installers und auf der Website. Wird ein Format
// ergänzt und eine Stelle vergessen, merkt das sonst erst der Nutzer - beim
// Doppelklick auf eine Datei, die die App eigentlich öffnen könnte.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const loaders = read('src/loaders.js');
const mainProcess = read('electron/main.cjs');
const pkg = JSON.parse(read('package.json'));
const indexHtml = read('website/index.html');

const list = (src) => [...src.matchAll(/'([^']+)'/g)].map((m) => m[1]);

/** Endungen, für die loadCadFile() einen Zweig hat. */
const loaderCases = [...loaders.matchAll(/case '([a-z0-9]+)':/g)].map((m) => m[1]);

/** Vom Hauptprozess akzeptierte Endungen (mit Punkt). */
const supported = list(/const SUPPORTED = \[([\s\S]*?)\];/.exec(mainProcess)[1])
  .map((e) => e.replace(/^\./, ''));

/** Endungen im Dateiauswahldialog. */
const dialogFilter = list(
  /name: 'CAD-Dateien', extensions: \[([\s\S]*?)\]/.exec(mainProcess)[1]);

/** Dateizuordnungen, die der Installer registriert. */
const associations = pkg.build.fileAssociations.map((a) => a.ext);

// DWG wird vor dem Laden mit LibreDWG nach DXF gewandelt und hat deshalb
// bewusst keinen eigenen Zweig im Loader.
const KONVERTIERT = ['dwg'];

describe('Formatlisten stimmen überein', () => {
  it('jede akzeptierte Endung kann auch geladen werden', () => {
    const ladbar = [...loaderCases, ...KONVERTIERT];
    expect([...supported].sort()).toEqual([...new Set(ladbar)].sort());
  });

  it('der Dateidialog bietet genau die unterstützten Endungen an', () => {
    expect([...dialogFilter].sort()).toEqual([...supported].sort());
  });

  it('der Installer registriert genau die unterstützten Endungen', () => {
    expect([...associations].sort()).toEqual([...supported].sort());
  });

  it('vergibt keine Dateizuordnung doppelt', () => {
    expect(associations).toHaveLength(new Set(associations).size);
  });
});

describe('Website verspricht nichts Unhaltbares', () => {
  // Die Startseite behauptete einmal "Alle Formate" und nannte dabei
  // Formate, die die App noch gar nicht öffnen konnte.
  const genannt = (html) => [...new Set(
    [...html.matchAll(/\b(DXF|DWG|STEP|STP|IGES|IGS|BREP|STL|OBJ|3MF|PLY|GLTF|GLB|SAT|SLDPRT|IPT|CATPART|X_T|FBX|DAE|3DS)\b/g)]
      .map((m) => m[1].toLowerCase()))];

  it('nennt auf der Startseite nur Formate, die die App wirklich öffnet', () => {
    for (const f of genannt(indexHtml)) {
      expect(supported, `Website nennt "${f.toUpperCase()}", die App kennt es nicht`).toContain(f);
    }
  });

  it('nennt in der Formatzeile im Hero nur unterstützte Formate', () => {
    const zeile = /<p class="eyebrow mono formats">([\s\S]*?)<\/p>/.exec(indexHtml)[1];
    const formate = [...zeile.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1].toLowerCase());
    expect(formate.length).toBeGreaterThan(0);
    for (const f of formate) expect(supported).toContain(f);
  });

  it('nennt die Formate auch in den AGB korrekt', () => {
    for (const f of genannt(read('website/agb.html'))) {
      expect(supported, `AGB nennen "${f.toUpperCase()}", die App kennt es nicht`).toContain(f);
    }
  });
});

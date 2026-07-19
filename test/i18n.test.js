// Die Übersetzungen entstehen maschinell über ein lokales Ollama-Modell. Zwei
// Dinge gehen dabei still schief: ein Schlüssel fehlt (die App zeigt dann den
// rohen Schlüsselnamen) oder ein Platzhalter wie {n} überlebt die Übersetzung
// nicht (die Zahl fehlt dann in der Anzeige). Beides fällt sonst erst auf,
// wenn jemand die App in genau dieser Sprache benutzt.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../src/strings/en.js';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'strings');
const codes = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => f.replace('.js', ''));
const dicts = Object.fromEntries(await Promise.all(
  codes.map(async (c) => [c, (await import(join(dir, `${c}.js`))).default])));

const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Übersetzungen', () => {
  it('deckt alle im Projekt vorgesehenen Sprachen ab', () => {
    expect(codes.length).toBeGreaterThanOrEqual(20);
    expect(codes).toContain('de');
    expect(codes).toContain('en');
  });

  it.each(codes)('%s: kennt jeden Schlüssel aus dem Englischen', (code) => {
    const fehlend = Object.keys(en).filter((k) => !(k in dicts[code]));
    expect(fehlend, `fehlende Schlüssel in ${code}.js`).toEqual([]);
  });

  it.each(codes)('%s: hat keine Schlüssel, die es im Englischen nicht gibt', (code) => {
    const überzählig = Object.keys(dicts[code]).filter((k) => !(k in en));
    expect(überzählig, `unbekannte Schlüssel in ${code}.js`).toEqual([]);
  });

  it.each(codes)('%s: behält die Platzhalter der Vorlage', (code) => {
    for (const [key, wert] of Object.entries(dicts[code])) {
      expect(vars(wert), `${code}.js: Platzhalter in "${key}" stimmen nicht`).toEqual(vars(en[key]));
    }
  });

  it.each(codes)('%s: lässt keinen Text leer', (code) => {
    const leer = Object.entries(dicts[code]).filter(([, v]) => !String(v).trim());
    expect(leer.map(([k]) => k), `leere Texte in ${code}.js`).toEqual([]);
  });
});

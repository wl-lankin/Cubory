// Der Versionsverlauf wird in der App angezeigt. Diese Tests stellen sicher,
// dass er wohlgeformt ist und - am wichtigsten - dass die ausgelieferte Version
// aus package.json auch wirklich einen Eintrag hat. So kann keine Version ohne
// Änderungshinweise beim Nutzer landen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGELOG, CHANGE_TYPES, entryText, latestVersion } from '../src/changelog.js';
import de from '../src/strings/de.js';
import en from '../src/strings/en.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const semver = (v) => v.split('.').map(Number);
const cmp = (a, b) => {
  const [aa, bb] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return 0;
};

describe('Versionsverlauf', () => {
  it('enthält einen Eintrag für die ausgelieferte Version', () => {
    const versions = CHANGELOG.map((v) => v.version);
    expect(versions, `package.json ist ${pkg.version}, fehlt im Verlauf`).toContain(pkg.version);
  });

  it('die neueste Version ist die aus package.json', () => {
    // Ein Release ohne aktualisierten Verlauf fiele hier auf.
    expect(latestVersion()).toBe(pkg.version);
  });

  it('ist absteigend nach Version sortiert (neueste zuerst)', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(cmp(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    }
  });

  it('jede Version hat ein gültiges Datum und Einträge', () => {
    for (const v of CHANGELOG) {
      expect(v.date, `${v.version} braucht ein Datum`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.entries.length, `${v.version} braucht Einträge`).toBeGreaterThan(0);
    }
  });

  it('jeder Eintrag hat eine bekannte Art und Text auf Deutsch und Englisch', () => {
    for (const v of CHANGELOG) {
      for (const e of v.entries) {
        expect(CHANGE_TYPES, `unbekannte Art "${e.type}" in ${v.version}`).toContain(e.type);
        expect(e.de?.trim(), `de fehlt in ${v.version}`).toBeTruthy();
        expect(e.en?.trim(), `en fehlt in ${v.version}`).toBeTruthy();
      }
    }
  });

  it('entryText fällt bei fehlender Sprache auf Englisch zurück', () => {
    const e = { type: 'new', en: 'English only' };
    expect(entryText(e, 'fr')).toBe('English only');
    expect(entryText({ type: 'new', de: 'Deutsch', en: 'English' }, 'de')).toBe('Deutsch');
  });

  it('für jede Art gibt es eine Beschriftung in de und en', () => {
    for (const type of CHANGE_TYPES) {
      expect(de['changelog.' + type], `de-Label für ${type}`).toBeTruthy();
      expect(en['changelog.' + type], `en-Label für ${type}`).toBeTruthy();
    }
    for (const key of ['title', 'subtitle', 'whatsNew', 'whatsNewSub', 'current']) {
      expect(de['changelog.' + key], `de changelog.${key}`).toBeTruthy();
      expect(en['changelog.' + key], `en changelog.${key}`).toBeTruthy();
    }
  });
});

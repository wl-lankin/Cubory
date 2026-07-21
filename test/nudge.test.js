// @vitest-environment happy-dom
//
// Der Upgrade-Nudge ist der einzige lizenzabhängige "Login"-Hinweis beim Start.
// Anforderung: ein zahlender Nutzer sieht ihn NIE. Der Aufrufer koppelt das an
// die Startanimation (Promise.all([introDone, whenLicenseSettled])) und ruft
// maybeShowNudge erst mit dem endgültigen Kontostand auf - dieser Test sichert
// den zweiten Teil: bei bezahltem Zustand entsteht garantiert keine Karte.
import { describe, it, expect, beforeEach } from 'vitest';
import { maybeShowNudge } from '../src/nudge.js';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

const nudgeDa = () => !!document.getElementById('nudge-overlay');

describe('Upgrade-Nudge beim Start', () => {
  for (const kind of ['pro', 'lifetime', 'trial']) {
    it(`erscheint nie für einen zahlenden Nutzer (${kind})`, () => {
      const gezeigt = maybeShowNudge({ kind, entitlements: ['export'] }, { onUpgrade() {} });
      expect(gezeigt).toBe(false);
      expect(nudgeDa()).toBe(false);
    });
  }

  for (const kind of ['free', 'anonymous']) {
    it(`erscheint für einen Nutzer ohne Lizenz (${kind})`, () => {
      const gezeigt = maybeShowNudge({ kind, entitlements: [] }, { onUpgrade() {} });
      expect(gezeigt).toBe(true);
      expect(nudgeDa()).toBe(true);
    });
  }

  it('erscheint höchstens einmal je 24 Stunden', () => {
    expect(maybeShowNudge({ kind: 'free', entitlements: [] }, { onUpgrade() {} })).toBe(true);
    document.getElementById('nudge-overlay')?.remove();
    // zweiter Start kurz danach: kein erneuter Hinweis
    expect(maybeShowNudge({ kind: 'free', entitlements: [] }, { onUpgrade() {} })).toBe(false);
    expect(nudgeDa()).toBe(false);
  });

  it('ein zahlender Nutzer bekommt ihn auch dann nicht, wenn er lange nicht dran war', () => {
    // Selbst ohne jede Nudge-Historie bleibt die Karte für Pro aus.
    localStorage.removeItem('cubory-nudge-at');
    expect(maybeShowNudge({ kind: 'pro', entitlements: ['export'] }, { onUpgrade() {} })).toBe(false);
    expect(nudgeDa()).toBe(false);
  });
});

// Die Intro hält den Kristall kurz vor der Explosion, bis die Lizenzprüfung
// steht - so ist ein Pro-Nutzer, wenn die Animation durch ist, sicher schon
// eingeloggt. holdProgress bildet dafür die reale Zeit auf die Fortschrittszeit
// ab. Geprüft wird: kein Halten ohne Grund, sauberes Weiterlaufen nach der
// Freigabe (kein Zeitsprung) und die Notbremse, falls die Freigabe ausbleibt.
import { describe, it, expect } from 'vitest';
import { holdProgress, HOLD_POINT, MAX_EXTRA_HOLD } from '../src/intro.js';

const fresh = (released) => ({ released, holdOffset: 0, holdStartRaw: null });

describe('Intro-Haltelogik (holdProgress)', () => {
  it('läuft ohne Halten durch, wenn schon freigegeben', () => {
    const st = fresh(true);
    expect(holdProgress(1.0, st)).toBeCloseTo(1.0);
    expect(holdProgress(HOLD_POINT, st)).toBeCloseTo(HOLD_POINT);
    expect(holdProgress(3.3, st)).toBeCloseTo(3.3);
  });

  it('hält bei HOLD_POINT, solange nicht freigegeben', () => {
    const st = fresh(false);
    expect(holdProgress(2.0, st)).toBeCloseTo(2.0);          // vor der Halte-Stelle
    expect(holdProgress(HOLD_POINT, st)).toBeCloseTo(HOLD_POINT);
    expect(holdProgress(3.2, st)).toBeCloseTo(HOLD_POINT);   // verharrt
    expect(holdProgress(3.9, st)).toBeCloseTo(HOLD_POINT);
    expect(st.released).toBe(false);
  });

  it('läuft nach der Freigabe stetig weiter - ohne Zeitsprung', () => {
    const st = fresh(false);
    holdProgress(HOLD_POINT, st);
    expect(holdProgress(3.0, st)).toBeCloseTo(HOLD_POINT);   // noch am Halten
    st.released = true;                                       // Lizenz steht (Promise)
    // ab jetzt schreitet t genau im Takt der realen Zeit voran, beginnend bei HOLD_POINT
    expect(holdProgress(3.2, st)).toBeCloseTo(HOLD_POINT + 0.2);
    expect(holdProgress(3.6, st)).toBeCloseTo(HOLD_POINT + 0.6);
  });

  it('greift zur Notbremse, wenn die Freigabe ausbleibt - ohne Sprung', () => {
    const st = fresh(false);
    holdProgress(HOLD_POINT, st);
    // deutlich vor Ablauf noch am Halten
    expect(holdProgress(HOLD_POINT + 1.0, st)).toBeCloseTo(HOLD_POINT);
    expect(st.released).toBe(false);
    // über die Grenze hinaus: Notbremse gibt frei; der Freigabe-Frame bleibt
    // stetig bei HOLD_POINT (kein Sprung nach vorn)
    const tRelease = holdProgress(HOLD_POINT + MAX_EXTRA_HOLD + 0.3, st);
    expect(st.released).toBe(true);
    expect(tRelease).toBeCloseTo(HOLD_POINT);
    // erst der nächste Frame schreitet weiter voran
    expect(holdProgress(HOLD_POINT + MAX_EXTRA_HOLD + 0.6, st)).toBeCloseTo(HOLD_POINT + 0.3);
  });

  it('hält nie länger als HOLD_POINT + MAX_EXTRA_HOLD an', () => {
    const st = fresh(false);
    // Zeitachse in kleinen Schritten abfahren, Freigabe kommt nie von außen
    let releasedAt = null;
    for (let i = 0; i <= 80 && releasedAt === null; i++) {
      const raw = i * 0.1;
      const before = st.released;
      holdProgress(raw, st);
      if (!before && st.released) releasedAt = raw;
    }
    expect(releasedAt).not.toBeNull();
    // Notbremse greift spätestens einen Zeitschritt nach der Grenze
    expect(releasedAt).toBeGreaterThanOrEqual(HOLD_POINT + MAX_EXTRA_HOLD - 0.11);
    expect(releasedAt).toBeLessThanOrEqual(HOLD_POINT + MAX_EXTRA_HOLD + 0.11);
  });
});

// Rauchtest der gebauten App. Deckt ab, was Unit-Tests nicht sehen: dass
// Electron startet, der Renderer sein CSS bekommt und eine Datei vom Öffnen
// bis zur Statusanzeige durchläuft.
//
// Braucht einen Renderer-Build (npm run build:renderer). Unter Linux ohne
// Bildschirm über xvfb-run starten.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dxfWithLayers, plyMesh, plyPointCloud, stlAscii, objCube,
  glbAssembly, threeMfProduction,
} from '../fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const DATEIEN = [
  ['zeichnung.dxf', dxfWithLayers({ AUSSEN: 5, INNEN: 1 }), 'DXF'],
  ['wuerfel.stl', stlAscii(), 'STL'],
  ['wuerfel.obj', objCube(), 'OBJ'],
  ['wuerfel.ply', plyMesh(), 'PLY'],
  ['scan.ply', plyPointCloud(300), 'PLY'],
  ['baugruppe.glb', glbAssembly(), 'GLB'],
  ['slicer.3mf', threeMfProduction(), '3MF'],
];

let app;
let win;
let arbeitsordner;

beforeAll(async () => {
  arbeitsordner = mkdtempSync(join(tmpdir(), 'cubory-e2e-'));
  for (const [name, daten] of DATEIEN) {
    writeFileSync(join(arbeitsordner, name), Buffer.from(daten));
  }

  app = await electron.launch({
    args: ['.'],
    cwd: root,
    executablePath: join(root, 'node_modules', '.bin', 'electron'),
    // Eigenes Profil: der Test darf weder eine echte Anmeldung noch zuletzt
    // geöffnete Dateien des Entwicklers anfassen.
    env: { ...process.env, CUBORY_TEST_USERDATA: join(arbeitsordner, 'profil') },
  });
  win = await app.firstWindow();
  win.on('dialog', (d) => d.dismiss().catch(() => {}));
  await win.waitForLoadState('domcontentloaded');
  await win.waitForFunction(() => typeof window.__openPath === 'function', null, { timeout: 30000 });
  // Diese Version als gesehen markieren, bevor die Startanimation endet - sonst
  // öffnete sich "Was ist neu" von selbst und legte sich über die Oberfläche.
  await win.evaluate(async () => {
    const info = await window.cubory.appInfo();
    localStorage.setItem('cubory-seen-version', info.version);
  });
  // Der Upgrade-Nudge legt sich ebenfalls über die Oberfläche.
  await win.evaluate(() => document.getElementById('nudge-overlay')?.remove());
}, 120000);

afterAll(async () => {
  await app?.close();
  if (arbeitsordner) rmSync(arbeitsordner, { recursive: true, force: true });
});

describe('App startet', () => {
  it('öffnet genau ein Fenster', async () => {
    expect(await app.windows()).toHaveLength(1);
  });

  // Regression: occt-import-js stand in optimizeDeps.exclude, das Modul brach
  // beim Laden ab und Vite kam nie dazu, das CSS einzufügen - die App zeigte
  // rohes, ungestyltes HTML.
  it('hat sein CSS geladen', async () => {
    const bg = await win.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(r + g + b, `Hintergrund ist ${bg} - CSS fehlt vermutlich`).toBeLessThan(200);
    const regeln = await win.evaluate(() =>
      [...document.styleSheets].reduce((n, s) => n + (s.cssRules?.length || 0), 0));
    expect(regeln).toBeGreaterThan(50);
  });

  it('meldet keine Fehler in der Konsole', async () => {
    const fehler = [];
    win.on('pageerror', (e) => fehler.push(e.message));
    await win.waitForTimeout(500);
    expect(fehler).toEqual([]);
  });
});

describe('Dateien öffnen', () => {
  it.each(DATEIEN.map(([n, , f]) => [n, f]))(
    '%s wird als %s geladen',
    async (name, format) => {
      await win.evaluate((p) => window.__openPath(p), join(arbeitsordner, name));
      await win.waitForFunction(
        (f) => document.getElementById('status-format')?.textContent === f,
        format,
        { timeout: 30000 });

      const status = await win.evaluate(() => ({
        format: document.getElementById('status-format')?.textContent,
        inhalt: document.getElementById('status-entities')?.textContent,
        masse: document.getElementById('status-size')?.textContent,
      }));
      expect(status.format).toBe(format);
      // Ohne Geometrie bliebe die Anzeige leer - die Datei wäre nur scheinbar
      // geladen.
      expect(status.inhalt).toMatch(/\d/);
      expect(status.masse).toMatch(/\d/);
    },
    60000);

  it('zeigt die Ebenen einer DXF in der Seitenleiste', async () => {
    await win.evaluate((p) => window.__openPath(p), join(arbeitsordner, 'zeichnung.dxf'));
    await win.waitForTimeout(800);
    const ebenen = await win.evaluate(() =>
      [...document.querySelectorAll('#layers-list li')].map((li) => li.textContent));
    expect(ebenen).toHaveLength(2);
    expect(ebenen.join(' ')).toContain('AUSSEN');
    expect(ebenen.join(' ')).toContain('INNEN');
  }, 60000);

  it('zeigt die Teile einer Baugruppe in derselben Leiste', async () => {
    await win.evaluate((p) => window.__openPath(p), join(arbeitsordner, 'baugruppe.glb'));
    await win.waitForTimeout(800);
    const teile = await win.evaluate(() =>
      [...document.querySelectorAll('#layers-list li')].map((li) => li.textContent).join(' '));
    expect(teile).toContain('Gehäuse');
    expect(teile).toContain('Deckel');
  }, 60000);

  it('legt für jede Datei einen eigenen Reiter an', async () => {
    const reiter = await win.evaluate(() =>
      [...document.querySelectorAll('#tabbar [data-tab]')].map((t) => t.textContent));
    expect(reiter.length).toBe(DATEIEN.length);
    expect(reiter.join(' ')).toContain('slicer.3mf');
  });
});

describe('Versionsverlauf', () => {
  it('öffnet sich über das Über-Fenster und zeigt die Versionen mit Tags', async () => {
    // Der Upgrade-Nudge erscheint erst nach Intro und Lizenzprüfung, also evtl.
    // nach der einmaligen Entfernung im Setup - vor dem Klick sicher wegräumen.
    await win.evaluate(() => document.getElementById('nudge-overlay')?.remove());
    await win.click('#btn-about');
    await win.waitForSelector('#about-version', { timeout: 5000 });
    await win.click('#about-version');
    await win.waitForSelector('#changelog-modal .cl-version', { timeout: 5000 });
    const info = await win.evaluate(async () => ({
      laufend: (await window.cubory.appInfo()).version,
      versionen: [...document.querySelectorAll('.cl-vnum')].map((n) => n.textContent),
      tags: [...new Set([...document.querySelectorAll('.cl-tag')].map((n) => n.textContent))],
      aktuellVersion: document.querySelector('.cl-version .cl-badge-current')
        ?.closest('.cl-version')?.querySelector('.cl-vnum')?.textContent || null,
      text: document.querySelector('.cl-text')?.textContent || '',
    }));
    // Die laufende (gebaute) Version muss im Verlauf stehen und als aktuell markiert sein.
    expect(info.versionen).toContain(info.laufend);
    expect(info.aktuellVersion).toBe(info.laufend);
    expect(info.tags.length).toBeGreaterThan(0);
    expect(info.text.length).toBeGreaterThan(0);
    await win.click('#cl-close');
    await win.waitForSelector('#changelog-modal', { state: 'detached', timeout: 5000 });
  }, 60000);
});

// Tests für den Export. Geprüft wird generateExport() mit einem minimalen
// Viewer-Stub - genau die Schnittstelle, die das Export-Modal benutzt. Der
// Schwerpunkt liegt auf DXF: es entsteht aus jeder 2D-Quelle (Linien) und aus
// jedem 3D-Modell (Dreiecksflächen) und muss sich sauber zurücklesen lassen.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { exportFormats, generateExport } from 'cubory-core';
import { loadCadFile } from '../src/loaders.js';

/** Viewer-Stub (cubory-core ab 0.4: exportModel) mit einem Wurzelknoten aus 2D-Liniensegmenten. */
function viewer2d(segments) {
  const pts = [];
  for (const [x1, y1, x2, y2] of segments) pts.push(x1, y1, 0, x2, y2, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const root = new THREE.Group();
  root.add(new THREE.LineSegments(geo));
  root.updateMatrixWorld(true);
  return { exportModel: () => root, captureScreenshot: () => 'data:image/png;base64,AAAA' };
}

/** Viewer-Stub mit einem Mesh aus Dreiecken (je [x,y,z] pro Ecke). */
function viewer3d(triangles) {
  const pts = [];
  for (const tri of triangles) for (const p of tri) pts.push(...p);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo));
  root.updateMatrixWorld(true);
  return { exportModel: () => root, captureScreenshot: () => 'data:image/png;base64,AAAA' };
}

const decode = (b64) => Buffer.from(b64, 'base64').toString('utf8');
const count = (txt, entity) => (txt.match(new RegExp('\\n' + entity + '\\n', 'g')) || []).length;

describe('Zielformate je Modelltyp', () => {
  it('2D bietet DXF, SVG und PNG', () => {
    expect(exportFormats({ mode: '2d' }).map((o) => o.value)).toEqual(['dxf', 'svg', 'png']);
  });

  it('3D bietet die Netzformate und DXF', () => {
    expect(exportFormats({ mode: '3d' }).map((o) => o.value)).toEqual(['stl', 'obj', 'ply', 'glb', 'dxf']);
  });

  it('DXF geht aus beiden Modelltypen', () => {
    expect(exportFormats({ mode: '2d' }).some((o) => o.value === 'dxf')).toBe(true);
    expect(exportFormats({ mode: '3d' }).some((o) => o.value === 'dxf')).toBe(true);
  });
});

describe('DXF aus 2D (Linien)', () => {
  const segs = [[0, 0, 100, 0], [100, 0, 100, 50], [100, 50, 0, 50], [0, 50, 0, 0]];

  it('schreibt je Segment eine LINE und schließt sauber ab', async () => {
    const g = await generateExport({ mode: '2d' }, viewer2d(segs), 'dxf');
    expect(g.ext).toBe('dxf');
    expect(g.text).toContain('ENTITIES');
    expect(count(g.text, 'LINE')).toBe(segs.length);
    expect(g.text.trim().endsWith('EOF')).toBe(true);
    expect(g.text).toBe(decode(g.base64)); // base64 trägt exakt denselben Text
  });

  it('liefert eine helle Vorschau, damit die schwarzen Linien sichtbar sind', async () => {
    const g = await generateExport({ mode: '2d' }, viewer2d(segs), 'dxf');
    expect(g.light).toBe(true);
    expect(g.previewUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('das exportierte DXF lässt sich wieder laden (Round-Trip)', async () => {
    const g = await generateExport({ mode: '2d' }, viewer2d(segs), 'dxf');
    const r = await loadCadFile('rt.dxf', new TextEncoder().encode(g.text).buffer);
    expect(r.format).toBe('DXF');
    expect(r.mode).toBe('2d');
    expect(r.stats.entities).toBe(segs.length);
  });
});

describe('DXF aus 3D (Dreiecksflächen)', () => {
  const tris = [
    [[0, 0, 0], [10, 0, 0], [0, 10, 0]],
    [[0, 0, 0], [0, 10, 0], [0, 0, 10]],
  ];

  it('schreibt je Dreieck ein 3DFACE', async () => {
    const g = await generateExport({ mode: '3d' }, viewer3d(tris), 'dxf');
    const txt = decode(g.base64);
    expect(count(txt, '3DFACE')).toBe(tris.length);
    expect(txt.trim().endsWith('EOF')).toBe(true);
  });

  it('bietet 3D-DXF keinen Text zum Kopieren (kann sehr groß werden)', async () => {
    const g = await generateExport({ mode: '3d' }, viewer3d(tris), 'dxf');
    expect(g.text).toBeUndefined();
  });
});

describe('SVG', () => {
  const segs = [[0, 0, 4000, 0], [4000, 0, 4000, 1500]];

  it('bleibt bei großen Zeichnungen sichtbar (nicht skalierender Strich)', async () => {
    const g = await generateExport({ mode: '2d' }, viewer2d(segs), 'svg');
    expect(g.ext).toBe('svg');
    expect(g.text).toContain('non-scaling-stroke');
    expect(g.text).toContain('viewBox="0 0 4000 1500"');
    expect(count('\n' + g.text, '<line')).toBe(0); // <line steht in einer Zeile
    expect((g.text.match(/<line /g) || []).length).toBe(segs.length);
  });
});

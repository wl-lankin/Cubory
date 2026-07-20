// Erzeugt aus dem aktuellen Modell die Exportdaten im gewählten Format.
// 2D (DXF/DWG) -> SVG oder PNG; 3D -> STL, OBJ, PLY oder GLB. Liefert stets
// base64 zum Speichern, dazu eine Vorschau-URL und - wo sinnvoll - den
// Textinhalt für die Zwischenablage.
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** Verfügbare Zielformate je Modelltyp. DXF geht aus beiden: 2D als Linien
 *  (laserfertig), 3D als Dreiecksflächen. */
export function exportFormats(model) {
  return model.mode === '2d'
    ? [{ value: 'dxf', label: 'DXF' }, { value: 'svg', label: 'SVG' }, { value: 'png', label: 'PNG' }]
    : [{ value: 'stl', label: 'STL' }, { value: 'obj', label: 'OBJ' },
       { value: 'ply', label: 'PLY' }, { value: 'glb', label: 'GLB' }, { value: 'dxf', label: 'DXF' }];
}

/** @returns {Promise<{base64, ext, previewUrl, text?}>} */
export async function generateExport(model, viewer, format) {
  if (format === 'svg') {
    const svg = buildSvg(viewer);
    const base64 = b64Text(svg);
    // light: das SVG hat schwarze Linien für weißes Papier - auf dem dunklen
    // Vorschaugrund wären sie unsichtbar, deshalb heller Hintergrund.
    return { base64, ext: 'svg', text: svg, previewUrl: `data:image/svg+xml;base64,${base64}`, light: true };
  }
  if (format === 'png') {
    const dataUrl = viewer.captureScreenshot(2);
    return { base64: dataUrl.split(',')[1], ext: 'png', previewUrl: dataUrl };
  }
  if (format === 'dxf') {
    if (model.mode === '2d') {
      const dxf = buildDxf2d(viewer);
      const svg = buildSvg(viewer);
      // Vorschau als helle Zeichnung wie beim SVG; DXF-Text ist kopierbar.
      return { base64: b64Text(dxf), ext: 'dxf', text: dxf, light: true,
        previewUrl: `data:image/svg+xml;base64,${b64Text(svg)}` };
    }
    // 3D-DXF kann sehr groß werden - kein Text zum Kopieren.
    return { base64: b64Text(buildDxf3d(viewer)), ext: 'dxf', previewUrl: viewer.captureScreenshot(2) };
  }

  const root = viewer.exportRoot();
  if (!root) throw new Error('no geometry');
  // Bei den 3D-Formaten ist die Geometrie identisch - als Vorschau dient ein
  // Abbild der aktuellen Ansicht.
  const previewUrl = viewer.captureScreenshot(2);

  if (format === 'stl') {
    return { base64: bufToB64(new STLExporter().parse(root, { binary: true })), ext: 'stl', previewUrl };
  }
  if (format === 'obj') {
    return { base64: b64Text(new OBJExporter().parse(root)), ext: 'obj', previewUrl };
  }
  if (format === 'ply') {
    const buf = await new Promise((res) => new PLYExporter().parse(root, res, { binary: true }));
    return { base64: bufToB64(buf), ext: 'ply', previewUrl };
  }
  if (format === 'glb') {
    const buf = await new Promise((res, rej) => new GLTFExporter().parse(root, res, rej, { binary: true }));
    return { base64: bufToB64(buf), ext: 'glb', previewUrl };
  }
  throw new Error('unknown format ' + format);
}

/* ── SVG aus den 2D-Liniensegmenten ──────────────────────────────────────── */

const r = (v) => Math.round(v * 1000) / 1000;

function buildSvg(viewer) {
  const segs = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  viewer.exportRoot()?.traverse((o) => {
    if (!o.isLineSegments || !o.visible) return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 2) {
      const x1 = p.getX(i), y1 = p.getY(i), x2 = p.getX(i + 1), y2 = p.getY(i + 1);
      segs.push([x1, y1, x2, y2]);
      minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2);
      minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2);
    }
  });
  if (!segs.length) return '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const w = maxX - minX, h = maxY - minY;
  const lines = segs.map(([x1, y1, x2, y2]) =>
    `<line x1="${r(x1 - minX)}" y1="${r(maxY - y1)}" x2="${r(x2 - minX)}" y2="${r(maxY - y2)}"/>`).join('\n');
  // non-scaling-stroke: die Linie bleibt bei jedem Maßstab gleich dünn (1px).
  // Ohne das wäre eine dünne Linie in einer metergroßen Zeichnung unsichtbar -
  // in der Vorschau wie in jeder SVG-Anzeige. vector-effect wird nicht vererbt,
  // deshalb per CSS-Regel auf jede Linie statt als Gruppen-Attribut.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}mm" height="${r(h)}mm">\n`
    + `<style>line{vector-effect:non-scaling-stroke}</style>\n`
    + `<g stroke="#000" stroke-width="1" fill="none">\n${lines}\n</g>\n</svg>\n`;
}

/* ── DXF schreiben (minimales R12, überall lesbar) ───────────────────────── */

const num = (v) => String(Math.round(v * 1e6) / 1e6);

/** 2D: alle sichtbaren Liniensegmente als LINE-Entities. Y bleibt oben, wie in
 *  DXF üblich. Ideal fürs Lasern - eine saubere DXF aus jeder 2D-Quelle. */
function buildDxf2d(viewer) {
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  viewer.exportRoot()?.traverse((o) => {
    if (!o.isLineSegments || !o.visible) return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 2) {
      out.push('0', 'LINE', '8', '0',
        '10', num(p.getX(i)), '20', num(p.getY(i)), '30', '0.0',
        '11', num(p.getX(i + 1)), '21', num(p.getY(i + 1)), '31', '0.0');
    }
  });
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}

/** 3D: jedes Dreieck als 3DFACE (vierter Punkt = dritter). In Weltkoordinaten,
 *  passend zu den anderen 3D-Exporten. */
function buildDxf3d(viewer) {
  const root = viewer.exportRoot();
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  if (root) {
    root.updateWorldMatrix(true, true);
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const pos = o.geometry.getAttribute('position');
      const idx = o.geometry.index;
      const count = idx ? idx.count : pos.count;
      const vert = (i) => {
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
        return [num(v.x), num(v.y), num(v.z)];
      };
      for (let i = 0; i + 2 < count; i += 3) {
        const a = vert(i), b = vert(i + 1), c = vert(i + 2);
        out.push('0', '3DFACE', '8', '0',
          '10', a[0], '20', a[1], '30', a[2],
          '11', b[0], '21', b[1], '31', b[2],
          '12', c[0], '22', c[1], '32', c[2],
          '13', c[0], '23', c[1], '33', c[2]);
      }
    });
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}

/* ── base64-Helfer ───────────────────────────────────────────────────────── */

function b64Text(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function bufToB64(buffer) {
  const bytes = new Uint8Array(buffer.buffer ?? buffer);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

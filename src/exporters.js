// Erzeugt aus dem aktuellen Modell die Exportdaten im gewählten Format.
// 2D (DXF/DWG) -> SVG oder PNG; 3D -> STL, OBJ, PLY oder GLB. Liefert stets
// base64 zum Speichern, dazu eine Vorschau-URL und - wo sinnvoll - den
// Textinhalt für die Zwischenablage.
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** Verfügbare Zielformate je Modelltyp. */
export function exportFormats(model) {
  return model.mode === '2d'
    ? [{ value: 'svg', label: 'SVG' }, { value: 'png', label: 'PNG' }]
    : [{ value: 'stl', label: 'STL' }, { value: 'obj', label: 'OBJ' },
       { value: 'ply', label: 'PLY' }, { value: 'glb', label: 'GLB' }];
}

/** @returns {Promise<{base64, ext, previewUrl, text?}>} */
export async function generateExport(model, viewer, format) {
  if (format === 'svg') {
    const svg = buildSvg(viewer);
    const base64 = b64Text(svg);
    return { base64, ext: 'svg', text: svg, previewUrl: `data:image/svg+xml;base64,${base64}` };
  }
  if (format === 'png') {
    const dataUrl = viewer.captureScreenshot(2);
    return { base64: dataUrl.split(',')[1], ext: 'png', previewUrl: dataUrl };
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
    const text = new OBJExporter().parse(root);
    return { base64: b64Text(text), ext: 'obj', text, previewUrl };
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}mm" height="${r(h)}mm">\n`
    + `<g stroke="#000" stroke-width="0.2" fill="none">\n${lines}\n</g>\n</svg>\n`;
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

// Pro-Features: Messen, Schnittansicht, Explosionsansicht, Export.
// Jedes Feature prüft sein Entitlement in der UI; die Durchsetzung des
// Exports passiert zusätzlich im Main-Prozess.
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { t } from './i18n.js';
import { can, openAccountModal } from './account.js';

let viewer = null;
let getModel = null; // () => current {mode, name} | null
let measuring = false;
let sectionOn = false;
let explodeOn = false;

const $ = (id) => document.getElementById(id);

export function initProFeatures(v, currentModel) {
  viewer = v;
  getModel = currentModel;

  viewer.onFrame = updateMeasureLabels;

  // Esc beendet das aktive Werkzeug
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (measuring) {
      measuring = false;
      $('viewport').classList.remove('measuring');
      viewer.clearMeasurements();
      $('measure-labels').innerHTML = '';
      $('tool-measure')?.classList.remove('on');
    }
    if (sectionOn) {
      sectionOn = false;
      viewer.setSection(null);
      closePanel();
      $('tool-section')?.classList.remove('on');
    }
    if (explodeOn) {
      explodeOn = false;
      viewer.setExplode(0);
      closePanel();
      $('tool-explode')?.classList.remove('on');
    }
  });

  viewer.renderer.domElement.addEventListener('click', (e) => {
    if (!measuring) return;
    const p = viewer.pickPoint(e.clientX, e.clientY);
    if (!p) return;
    const m = viewer.addMeasurePoint(p);
    if (m) addMeasureLabel(m);
  });
}

function requirePro(entitlement) {
  if (can(entitlement)) return true;
  alert(t('pro.locked'));
  openAccountModal();
  return false;
}

/** Von der Toolbar aufgerufen; true = Toggle-Zustand für den Button. */
export function handleProAction(action, btn) {
  switch (action) {
    case 'measure': return toggleMeasure(btn);
    case 'section': return toggleSection(btn);
    case 'explode': return toggleExplode(btn);
    case 'export': runExport(); return null;
  }
  return null;
}

/** Beim Laden eines neuen Modells: alles zurücksetzen. */
export function resetProFeatures() {
  viewer?.setExplode(0);
  viewer?.setSection(null);
  viewer?.clearMeasurements();
  measuring = false;
  sectionOn = false;
  explodeOn = false;
  $('viewport').classList.remove('measuring');
  $('feature-panel').hidden = true;
  $('measure-labels').innerHTML = '';
  ['tool-measure', 'tool-section', 'tool-explode'].forEach((id) => $(id)?.classList.remove('on'));
}

export function updateProLocks() {
  const locks = {
    'tool-measure': 'measurements',
    'tool-section': 'section_views',
    'tool-explode': 'exploded_views',
    'tool-export': 'export',
    'tool-hdshot': 'hires_screenshot',
  };
  for (const [id, ent] of Object.entries(locks)) {
    $(id)?.classList.toggle('locked', !can(ent));
  }
}

/* ── Messen ──────────────────────────────────────────────────────────────── */

function toggleMeasure() {
  if (!measuring && !requirePro('measurements')) return false;
  measuring = !measuring;
  $('viewport').classList.toggle('measuring', measuring);
  if (!measuring) {
    viewer.clearMeasurements();
    $('measure-labels').innerHTML = '';
  } else {
    closePanel();
    showHintLabel();
  }
  return measuring;
}

function showHintLabel() {
  const el = document.createElement('div');
  el.className = 'measure-label';
  el.style.left = '50%';
  // Unter die Werkzeugleiste, gleiche Höhe wie das Feature-Panel. Ohne das
  // eigene translateX hier zöge die -130%-Verschiebung der Klasse den Hinweis
  // nach oben hinter die Leiste - genau dort war er vorher verdeckt.
  el.style.top = '52px';
  el.style.transform = 'translateX(-50%)';
  el.textContent = t('measure.hint');
  el.dataset.hint = '1';
  $('measure-labels').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function addMeasureLabel(m) {
  const el = document.createElement('div');
  el.className = 'measure-label';
  el.textContent = formatMm(m.distance);
  $('measure-labels').appendChild(el);
  m.el = el;
}

function updateMeasureLabels() {
  if (!viewer.measurements) return;
  for (const m of viewer.measurements) {
    if (!m.el) continue;
    const mid = m.a.clone().add(m.b).multiplyScalar(0.5);
    const s = viewer.toScreen(mid);
    m.el.style.left = `${s.x}px`;
    m.el.style.top = `${s.y}px`;
    m.el.style.display = s.visible ? '' : 'none';
  }
}

function formatMm(v) {
  return (v >= 100 ? Math.round(v) : v.toFixed(2)) + ' mm';
}

// Zahl fürs Eingabefeld: große Werte ganzzahlig, kleine mit einer Nachkommastelle.
function roundMm(v) {
  return v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
}

/* ── Schnittansicht ──────────────────────────────────────────────────────── */

function toggleSection() {
  if (!sectionOn && !requirePro('section_views')) return false;
  sectionOn = !sectionOn;
  if (!sectionOn) {
    viewer.setSection(null);
    closePanel();
    return false;
  }
  explodeOn = false;
  $('tool-explode')?.classList.remove('on');
  openPanel(`
    ${['x', 'y', 'z'].map((a) => `<button class="axis" data-axis="${a}">${a.toUpperCase()}</button>`).join('')}
    <input type="range" id="section-t" min="0" max="1000" value="500" />
    <span class="section-field"><input type="number" id="section-mm" class="section-mm" min="0" step="0.1"
      title="${t('section.posTip')}" /><span class="section-unit">mm</span></span>`);
  const panel = $('feature-panel');
  const slider = $('section-t');
  const input = $('section-mm');
  let axis = viewer.longestAxis?.() || 'x';
  let dim = 0;

  // Regler bewegt -> Schnitt setzen, Feld nachziehen.
  const fromSlider = () => {
    const r = viewer.setSection(axis, Number(slider.value) / 1000);
    dim = r.dim;
    input.max = roundMm(dim);
    if (document.activeElement !== input) input.value = roundMm(r.mm);
  };
  // Zahl eingetippt -> auf 0..dim begrenzen, Regler und Schnitt nachziehen.
  const fromInput = () => {
    const mm = Math.min(Math.max(parseFloat(input.value) || 0, 0), dim);
    slider.value = String(dim > 0 ? (mm / dim) * 1000 : 0);
    const r = viewer.setSection(axis, Number(slider.value) / 1000);
    input.value = roundMm(r.mm);
  };

  panel.querySelectorAll('.axis').forEach((b) => {
    b.classList.toggle('on', b.dataset.axis === axis);
    b.addEventListener('click', () => {
      axis = b.dataset.axis;
      panel.querySelectorAll('.axis').forEach((x) => x.classList.toggle('on', x === b));
      fromSlider();
    });
  });
  slider.addEventListener('input', fromSlider);
  input.addEventListener('change', fromInput);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { fromInput(); input.blur(); } });
  fromSlider();
  return true;
}

/* ── Explosionsansicht ───────────────────────────────────────────────────── */

function toggleExplode() {
  if (!explodeOn && !requirePro('exploded_views')) return false;
  explodeOn = !explodeOn;
  if (!explodeOn) {
    viewer.setExplode(0);
    closePanel();
    return false;
  }
  sectionOn = false;
  $('tool-section')?.classList.remove('on');
  viewer.setSection(null);
  if (!viewer.setExplode(0)) {
    alert(t('explode.na'));
    explodeOn = false;
    closePanel();
    return false;
  }
  openPanel(`<input type="range" id="explode-f" min="0" max="1000" value="0" />`);
  $('explode-f').addEventListener('input', () => {
    viewer.setExplode(Number($('explode-f').value) / 1000);
  });
  return true;
}

/* ── Export ──────────────────────────────────────────────────────────────── */

async function runExport() {
  if (!requirePro('export')) return;
  const model = getModel();
  if (!model) return;
  const { data, filename, filterName, ext } = buildExport(model);
  if (!data) return;
  await window.cubory.exportFile.save({ base64: data, filename, filterName, ext });
}

export function buildExport(model) {
  const base = (model.name || 'export').replace(/\.[^.]+$/, '');
  if (model.mode === '2d') {
    return { data: btoa(unescape(encodeURIComponent(buildSvg()))), filename: `${base}.svg`, filterName: 'SVG', ext: 'svg' };
  }
  const root = viewer.exportRoot();
  if (!root) return {};
  const buffer = new STLExporter().parse(root, { binary: true });
  let bin = '';
  const bytes = new Uint8Array(buffer.buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return { data: btoa(bin), filename: `${base}.stl`, filterName: 'STL', ext: 'stl' };
}

// 2D-Export: alle Liniensegmente des Modells als SVG
function buildSvg() {
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}mm" height="${r(h)}mm">\n` +
    `<g stroke="#000" stroke-width="0.2" fill="none">\n${lines}\n</g>\n</svg>\n`;
}

const r = (v) => Math.round(v * 1000) / 1000;

/* ── Panel-Helfer ────────────────────────────────────────────────────────── */

function openPanel(html) {
  const panel = $('feature-panel');
  panel.innerHTML = html;
  panel.hidden = false;
}

function closePanel() {
  const panel = $('feature-panel');
  panel.hidden = true;
  panel.innerHTML = '';
}

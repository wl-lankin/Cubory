import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './style.css';
import ambientUrl from './assets/ambient.jpg';
import wordmarkUrl from './assets/wordmark.png';
import { Viewer } from './viewer.js';
import { loadCadFile } from './loaders.js';
import { t, LOCALES, storedLang, currentLang, setLang } from './i18n.js';
import { playIntro } from './intro.js';
import { initAccount, initAbout, can, openAccountModal } from './account.js';
import { maybeShowNudge } from './nudge.js';
import { initProFeatures, handleProAction, resetProFeatures, updateProLocks } from './proFeatures.js';

document.getElementById('app').style.setProperty('--ambient-bg', `url(${ambientUrl})`);
document.getElementById('brand-wordmark').src = wordmarkUrl;
if (window.cubory?.platform === 'win32') document.body.classList.add('platform-win');

// Start-Animation: Partikel-Vortex → Kristall → Schockwelle; danach UI-Einflug.
// Bei reduzierter Bewegung oder direktem Dateistart wird sie übersprungen.
let intro = null;
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.body.classList.add('intro-done');
} else {
  document.body.classList.add('intro-playing');
  intro = playIntro(() => {
    document.body.classList.remove('intro-playing');
    document.body.classList.add('intro-done');
    intro = null;
  });
}

const el = {
  sidebar: document.getElementById('sidebar'),
  modelInfo: document.getElementById('model-info'),
  layersPanel: document.getElementById('layers-panel'),
  layersTitle: document.getElementById('layers-title'),
  layersList: document.getElementById('layers-list'),
  dropzone: document.getElementById('dropzone'),
  toolbar: document.getElementById('toolbar'),
  loading: document.getElementById('loading'),
  loadingText: document.getElementById('loading-text'),
  dropOverlay: document.getElementById('drop-overlay'),
  statusbar: document.getElementById('statusbar'),
  statusFormat: document.getElementById('status-format'),
  statusEntities: document.getElementById('status-entities'),
  statusSize: document.getElementById('status-size'),
  statusHint: document.getElementById('status-hint'),
  langSelect: document.getElementById('lang-select'),
};

const viewer = new Viewer(document.getElementById('viewport'));
initProFeatures(viewer, () => current);

/* ── Sprache ─────────────────────────────────────────────────────────────── */

function applyStatic() {
  document.documentElement.lang = currentLang();
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
}

function buildLangSelect() {
  el.langSelect.innerHTML = '';
  const sys = document.createElement('option');
  sys.value = 'system';
  sys.textContent = t('lang.system');
  el.langSelect.appendChild(sys);
  for (const [code, name] of LOCALES) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    el.langSelect.appendChild(opt);
  }
  el.langSelect.value = storedLang();
}

el.langSelect.addEventListener('change', () => {
  setLang(el.langSelect.value);
  applyStatic();
  buildLangSelect();
  if (current) renderModelUi(false);
});

buildLangSelect();
applyStatic();

// Pro-Features spiegeln den Lizenzzustand: gesperrte Tools bekommen ein Schloss
function updateProUi() {
  updateProLocks();
}

// Upgrade-Nudge: einmal pro Start prüfen, aber erst wenn das Intro vorbei ist
let nudgeChecked = false;
function checkNudge(state) {
  if (nudgeChecked) return;
  if (document.body.classList.contains('intro-playing')) {
    setTimeout(() => checkNudge(state), 800);
    return;
  }
  nudgeChecked = true;
  maybeShowNudge(state, { onUpgrade: () => openAccountModal() });
}

initAbout();
initAccount((state) => {
  updateProUi();
  checkNudge(state);
});
updateProUi();

/* ── Datei öffnen ────────────────────────────────────────────────────────── */

async function openViaDialog() {
  const payload = await window.cubory?.openDialog();
  if (payload) await openPayload(payload);
}

document.getElementById('btn-open').addEventListener('click', openViaDialog);
document.getElementById('btn-open-top').addEventListener('click', openViaDialog);

window.cubory?.onOpenFile((payload) => openPayload(payload));

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    openViaDialog();
  }
  if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && e.target.tagName !== 'SELECT') viewer.fit();
});

/* Drag & Drop */
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  el.dropOverlay.hidden = false;
});
window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (--dragDepth <= 0) { dragDepth = 0; el.dropOverlay.hidden = true; }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  el.dropOverlay.hidden = true;
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const data = await file.arrayBuffer();
  await openPayload({ name: file.name, size: file.size, data });
});

/* ── Laden & Anzeigen ────────────────────────────────────────────────────── */

let current = null;
// Sichtbarkeits-Zustand der Listen, überlebt einen Sprachwechsel
let uiState = { layerVis: {}, partVis: {}, isolated: null };

async function openPayload(payload) {
  // Kommt eine Datei per Doppelklick/Drop während des Intros: sofort beenden
  intro?.finish();
  el.loading.hidden = false;
  el.loadingText.textContent = t('loading.file', { name: payload.name });
  // dem Browser einen Frame Zeit geben, den Spinner zu zeichnen
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));

  try {
    const result = await loadCadFile(payload.name, payload.data);
    current = { ...result, name: payload.name, size: payload.size };
    uiState = { layerVis: {}, partVis: {}, isolated: null };
    resetProFeatures();
    viewer.setModel(result.object, result.mode);
    renderModelUi(true);
  } catch (err) {
    console.error(err);
    alert(`${t('error.open', { name: payload.name })}\n\n${err.message}`);
  } finally {
    el.loading.hidden = true;
  }
}

function renderModelUi(reset) {
  el.dropzone.style.display = 'none';
  el.toolbar.hidden = false;
  el.sidebar.hidden = false;
  el.statusbar.hidden = false;

  if (reset) {
    viewer.gridVisible = true;
    viewer.wireframe = false;
    viewer.edgesVisible = true;
  }
  document.querySelector('[data-action="grid"]').classList.toggle('on', viewer.gridVisible);
  document.querySelector('[data-action="wireframe"]').classList.toggle('on', viewer.wireframe);
  document.querySelector('[data-action="edges"]').classList.toggle('on', current.mode === '3d' && viewer.edgesVisible);
  document.querySelector('[data-action="edges"]').style.display =
    current.format === 'STEP' || current.format === 'IGES' || current.format === 'BREP' ? '' : 'none';
  document.querySelector('[data-action="wireframe"]').style.display = current.mode === '3d' ? '' : 'none';

  // Modell-Info
  const dims = viewer.getDimensions();
  const dimText = dims
    ? current.mode === '2d'
      ? `${fmt(dims.x)} × ${fmt(dims.y)} mm`
      : `${fmt(dims.x)} × ${fmt(dims.y)} × ${fmt(dims.z)} mm`
    : null;
  const rows = [
    [t('info.file'), current.name],
    [t('info.format'), current.format + (current.mode === '2d' ? ' · 2D' : ' · 3D')],
    [t('info.size'), formatBytes(current.size)],
  ];
  if (dimText) rows.push([t('info.dims'), dimText]);
  if (current.stats.entities != null) rows.push([t('info.entities'), String(current.stats.entities)]);
  if (current.stats.triangles != null) rows.push([t('info.triangles'), current.stats.triangles.toLocaleString(currentLang())]);
  el.modelInfo.innerHTML = rows
    .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd title="${escapeHtml(v)}">${escapeHtml(v)}</dd></div>`)
    .join('');

  // Ebenen (DXF) oder Teile (STEP)
  el.layersList.innerHTML = '';
  if (current.layers?.length) {
    el.layersTitle.textContent = t('panel.layers');
    el.layersPanel.hidden = false;
    for (const layer of current.layers) {
      const visible = uiState.layerVis[layer.name] !== false;
      const li = document.createElement('li');
      const hex = '#' + layer.color.toString(16).padStart(6, '0');
      li.innerHTML = `<span class="layer-swatch" style="background:${hex};color:${hex}"></span>
        <span class="layer-name" title="${escapeHtml(layer.name)}">${escapeHtml(layer.name)}</span>
        <span class="layer-count">${layer.count}</span>
        <span class="layer-eye">${visible ? '●' : '○'}</span>`;
      li.classList.toggle('off', !visible);
      li.addEventListener('click', () => {
        const nowVisible = uiState.layerVis[layer.name] === false;
        uiState.layerVis[layer.name] = nowVisible;
        viewer.setLayerVisible(layer.name, nowVisible);
        li.classList.toggle('off', !nowVisible);
        li.querySelector('.layer-eye').textContent = nowVisible ? '●' : '○';
      });
      el.layersList.appendChild(li);
    }
  } else if (current.parts?.length && current.parts.length > 1) {
    el.layersTitle.textContent = t('panel.parts');
    el.layersPanel.hidden = false;
    current.parts.forEach((part, index) => {
      const visible = uiState.partVis[index] !== false;
      const li = document.createElement('li');
      li.innerHTML = `<span class="layer-swatch" style="background:#b9c2ec;color:#b9c2ec"></span>
        <span class="layer-name" title="${escapeHtml(part)} - ${escapeHtml(t('part.isolateTip'))}">${escapeHtml(part)}</span>
        <span class="layer-eye" title="${escapeHtml(t('part.toggleTip'))}">${visible ? '●' : '○'}</span>`;
      li.classList.toggle('off', !visible);
      li.classList.toggle('active', uiState.isolated === index);

      // Punkt rechts: Teil ein-/ausblenden
      li.querySelector('.layer-eye').addEventListener('click', (e) => {
        e.stopPropagation();
        const nowVisible = uiState.partVis[index] === false;
        uiState.partVis[index] = nowVisible;
        viewer.setPartVisible(index, nowVisible);
        li.classList.toggle('off', !nowVisible);
        li.querySelector('.layer-eye').textContent = nowVisible ? '●' : '○';
      });

      // Klick auf die Zeile: Teil isolieren (Rest wird durchsichtig) / aufheben
      li.addEventListener('click', () => {
        uiState.isolated = uiState.isolated === index ? null : index;
        viewer.isolatePart(uiState.isolated);
        el.layersList.querySelectorAll('li').forEach((n, i) => n.classList.toggle('active', uiState.isolated === i));
      });
      el.layersList.appendChild(li);
    });
  } else {
    el.layersPanel.hidden = true;
  }

  // Statusleiste
  el.statusFormat.textContent = current.format;
  el.statusEntities.textContent =
    current.stats.entities != null
      ? t('status.entities', { n: current.stats.entities })
      : current.stats.triangles != null
        ? t('status.triangles', { n: current.stats.triangles.toLocaleString(currentLang()) })
        : '';
  el.statusSize.textContent = dimText ?? '';
  el.statusHint.textContent = current.mode === '2d' ? t('status.hint2d') : t('status.hint3d');
}

// Hooks für automatisierte Tests
import('./proFeatures.js').then((m) => { window.__buildExport = () => m.buildExport(current); });
window.__viewer = viewer;

// Hook für automatisierte Tests: Datei über Pfad laden
window.__openPath = async (p) => {
  const payload = await window.cubory.readFile(p);
  if (payload) await openPayload(payload);
  return !!payload;
};

/* ── Toolbar ─────────────────────────────────────────────────────────────── */

el.toolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('.tool');
  if (!btn) return;
  const action = btn.dataset.action;
  switch (action) {
    case 'fit': viewer.fit(); break;
    case 'iso': viewer.setView('iso'); break;
    case 'top': viewer.setView('top'); break;
    case 'front': viewer.setView('front'); break;
    case 'right': viewer.setView('right'); break;
    case 'grid': btn.classList.toggle('on', viewer.toggleGrid()); break;
    case 'wireframe': btn.classList.toggle('on', viewer.toggleWireframe()); break;
    case 'edges': btn.classList.toggle('on', viewer.toggleEdges()); break;
    case 'hdshot': takeHdScreenshot(); break;
    case 'measure':
    case 'section':
    case 'explode':
    case 'export': {
      const on = handleProAction(action, btn);
      if (on !== null) btn.classList.toggle('on', on);
      break;
    }
  }
});

async function takeHdScreenshot() {
  // UI-Check ist nur Anzeige; die Durchsetzung passiert im Main-Prozess
  if (!can('hires_screenshot')) {
    alert(t('pro.locked'));
    document.getElementById('btn-account').click();
    return;
  }
  const dataUrl = viewer.captureScreenshot(3);
  await window.cubory.screenshot.save(dataUrl);
}

/* ── Helfer ──────────────────────────────────────────────────────────────── */

function formatBytes(bytes) {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmt(n) {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// HD-Shot: Klick auf das Werkzeug öffnet ein eigenes Modal statt sofort den
// System-Speicherdialog. Der Screenshot wird mit Ladeanzeige erzeugt, als
// Vorschau gezeigt, und man wählt Auflösung und Zielordner inline - kein
// natives Fenster. Speichern in den gewählten Ordner oder direkt in die
// Zwischenablage.
import { t } from './i18n.js';
import { can, openAccountModal } from './account.js';

let viewer = null;
let getName = () => 'cubory';
let modal = null;

// Auflösungsstufen als Vielfaches der Viewport-Größe.
const SCALES = [2, 3, 4];

// Zustand des offenen Modals
let st = null;

export function initHdShot(viewerRef, nameFn) {
  viewer = viewerRef;
  if (nameFn) getName = nameFn;
}

export function openHdShot() {
  // Durchsetzung liegt zusätzlich im Main-Prozess; hier nur die Anzeige.
  if (!can('hires_screenshot')) {
    openAccountModal();
    return;
  }
  if (modal) return;
  modal = document.createElement('div');
  modal.id = 'hdshot-modal';
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.body.appendChild(modal);
  window.addEventListener('keydown', onEsc);

  st = { scale: 3, dataUrl: null, dims: null, dir: null, saved: null, busy: true };
  renderShell();
  init();
}

function onEsc(e) { if (e.key === 'Escape') close(); }

function close() {
  modal?.remove();
  modal = null;
  st = null;
  window.removeEventListener('keydown', onEsc);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function init() {
  const res = await window.cubory.screenshot.lastDir();
  st.dir = res.ok ? res.data : null;
  updateFoot();
  browse(st.dir); // Ordnerliste laden (async, füllt nur #hs-browse)
  await capture(); // Screenshot erzeugen (async, tauscht nur #hs-preview)
}

/** Screenshot in der gewählten Auflösung erzeugen. Der Renderer blockiert dabei
 *  kurz, deshalb erst die Ladeanzeige zeichnen lassen und dann aufnehmen.
 *  Getauscht wird nur die Vorschau - kein Neuaufbau des ganzen Modals, sonst
 *  flackert es und die Ordnerliste würde neu geladen. */
async function capture() {
  st.busy = true;
  updatePreview();
  updateControls();
  // zwei Frames warten, damit die Ladeanzeige sichtbar wird, bevor der
  // synchrone Renderdurchlauf die Oberfläche blockiert
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  st.dataUrl = viewer.captureScreenshot(st.scale);
  st.dims = viewer.screenshotSize ? viewer.screenshotSize(st.scale) : null;
  st.busy = false;
  st.saved = null;
  updatePreview();
  updateControls();
  updateFoot();
}

/* ── Zielordner navigieren (nur Ordner, keine Dateien) ───────────────────── */

async function browse(dirPath) {
  const res = await window.cubory.files.listDir(dirPath ?? st.dir ?? null);
  if (!res.ok) return;
  st.dir = res.data.path;
  st.browse = res.data;
  st.saved = null;
  renderBrowse();
  updateControls();
  updateFoot();
}

function crumbs(p) {
  const parts = p.split(/[/\\]/).filter(Boolean);
  const sep = p.startsWith('/') ? '/' : '';
  const out = [];
  let acc = sep;
  if (sep) out.push({ name: '/', path: '/' });
  for (const part of parts) {
    acc = acc + (acc.endsWith('/') || acc === '' ? '' : '/') + part;
    out.push({ name: part, path: acc });
  }
  return out.slice(-4); // nur die letzten Ebenen, sonst wird es zu breit
}

/* ── Rendern ─────────────────────────────────────────────────────────────── */

// Baut das Modal genau einmal auf. Danach ändern nur die Teil-Updater unten
// einzelne Bereiche - so tauscht die fertige Aufnahme einfach den Loader gegen
// das Bild, ohne Flackern.
function renderShell() {
  if (!modal) return;
  const defName = `${slug(getName())}-${stamp()}`;

  modal.innerHTML = `<div class="hs-card glass sheet sheet-corners">
    <div class="hs-head">
      <h2>${esc(t('hdshot.title'))}</h2>
      <button class="hs-x" id="hs-close" title="${esc(t('about.close'))}">✕</button>
    </div>

    <div class="hs-preview" id="hs-preview"></div>

    <div class="hs-scales">
      <span class="hs-label">${esc(t('hdshot.resolution'))}</span>
      ${SCALES.map((s) => `<button class="hs-scale" data-scale="${s}">${s}×</button>`).join('')}
    </div>

    <div class="hs-field">
      <span class="hs-label">${esc(t('hdshot.filename'))}</span>
      <span class="hs-name-wrap"><input type="text" id="hs-name" class="hs-name" value="${esc(defName)}"
        spellcheck="false" /><span class="hs-ext">.png</span></span>
    </div>

    <div class="hs-field hs-folder">
      <span class="hs-label">${esc(t('hdshot.folder'))}</span>
      <div class="hs-shortcuts" id="hs-shortcuts"></div>
    </div>

    <div id="hs-browse"></div>

    <div class="hs-foot">
      <span id="hs-foot-status"></span>
      <div class="hs-actions">
        <button class="btn btn-ghost" id="hs-copy">${esc(t('hdshot.copy'))}</button>
        <button class="btn btn-primary" id="hs-save">${esc(t('hdshot.save'))}</button>
      </div>
    </div>
  </div>`;

  // Statische Handler nur einmal setzen.
  modal.querySelector('#hs-close').addEventListener('click', close);
  modal.querySelectorAll('.hs-scale').forEach((b) => b.addEventListener('click', () => {
    const s = Number(b.dataset.scale);
    if (s !== st.scale && !st.busy) { st.scale = s; capture(); }
  }));
  modal.querySelector('#hs-copy').addEventListener('click', onCopy);
  modal.querySelector('#hs-save').addEventListener('click', onSave);
  modal.querySelector('#hs-name').addEventListener('input', () => { st.saved = null; updateFoot(); });

  updatePreview();
  updateControls();
  renderBrowse(); // zeigt zunächst den kleinen Loader
  updateFoot();
}

/* ── Teil-Updater ────────────────────────────────────────────────────────── */

function updatePreview() {
  const el = modal?.querySelector('#hs-preview');
  if (!el) return;
  el.innerHTML = st.busy
    ? `<div class="hs-loader"><div class="spinner"></div><span>${esc(t('hdshot.generating'))}</span></div>`
    : `<img src="${st.dataUrl}" alt="" /><span class="hs-dims mono">${st.dims ? `${st.dims.w} × ${st.dims.h}` : ''}</span>`;
}

function updateControls() {
  if (!modal) return;
  modal.querySelectorAll('.hs-scale').forEach((b) => {
    b.classList.toggle('on', Number(b.dataset.scale) === st.scale);
    b.disabled = st.busy;
  });
  const copy = modal.querySelector('#hs-copy');
  const save = modal.querySelector('#hs-save');
  if (copy) copy.disabled = st.busy;
  if (save) save.disabled = st.busy || !st.browse;
}

function renderBrowse() {
  const el = modal?.querySelector('#hs-browse');
  if (!el) return;
  const b = st.browse;

  // Shortcuts ändern sich nie - nur einmal aufbauen.
  const scut = modal.querySelector('#hs-shortcuts');
  if (scut && b && !scut.children.length) {
    scut.innerHTML = b.shortcuts.map((s) => `<button class="hs-sc" data-path="${esc(s.path)}">${esc(t('browser.' + s.key))}</button>`).join('');
    scut.querySelectorAll('.hs-sc').forEach((x) => x.addEventListener('click', () => browse(x.dataset.path)));
  }

  if (!b) {
    el.innerHTML = `<div class="hs-list hs-list-loading"><div class="spinner small"></div></div>`;
    return;
  }
  el.innerHTML = `<div class="hs-crumbs">
      ${crumbs(b.path).map((c, i, a) => `<button class="hs-crumb${i === a.length - 1 ? ' on' : ''}" data-path="${esc(c.path)}">${esc(c.name)}</button>${i < a.length - 1 ? '<span class="hs-sep">›</span>' : ''}`).join('')}
    </div>
    <div class="hs-list">
      ${b.parent ? `<div class="hs-row" data-dir="${esc(b.parent)}"><span class="hs-ic">…</span><span>..</span></div>` : ''}
      ${b.dirs.length
        ? b.dirs.map((x) => `<div class="hs-row" data-dir="${esc(x.path)}"><span class="hs-ic">▸</span><span>${esc(x.name)}</span></div>`).join('')
        : `<p class="hs-empty">${esc(t('hdshot.noSubfolders'))}</p>`}
    </div>`;
  el.querySelectorAll('[data-dir], .hs-crumb').forEach((x) =>
    x.addEventListener('click', () => browse(x.dataset.dir || x.dataset.path)));
}

function updateFoot() {
  const el = modal?.querySelector('#hs-foot-status');
  if (!el) return;
  if (st.saved) {
    el.innerHTML = `<span class="hs-saved">✓ ${esc(t('hdshot.saved'))} · <button class="hs-reveal" id="hs-reveal">${esc(t('hdshot.reveal'))}</button></span>`;
    el.querySelector('#hs-reveal').addEventListener('click', () => {
      if (st.saved) window.cubory.screenshot.reveal(st.saved);
    });
  } else {
    el.innerHTML = `<span class="hs-savepath mono" title="${esc(st.dir || '')}">${esc(shortPath(st.dir))}</span>`;
  }
}

async function onSave() {
  const filename = modal.querySelector('#hs-name')?.value || '';
  const res = await window.cubory.screenshot.saveTo({ dataUrl: st.dataUrl, dir: st.dir, filename });
  if (res.ok && res.data) {
    st.saved = res.data.path;
    updateFoot();
  } else {
    flash('#hs-save', t('hdshot.saveError'));
  }
}

async function onCopy() {
  const res = await window.cubory.screenshot.copy(st.dataUrl);
  flash('#hs-copy', res.ok ? t('hdshot.copied') : t('hdshot.copyError'), res.ok);
}

/** Kurze Rückmeldung am Button, dann Originaltext zurück. */
function flash(sel, text, ok = false) {
  const btn = modal?.querySelector(sel);
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = (ok ? '✓ ' : '') + text;
  btn.classList.toggle('hs-ok', ok);
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('hs-ok'); }, 1600);
}

/* ── Helfer ──────────────────────────────────────────────────────────────── */

function slug(s) {
  return String(s || 'cubory')
    .replace(/\.[^.]+$/, '')            // Dateiendung des Modells weg
    .replace(/[^\p{L}\p{N}]+/gu, '-')   // alles Nicht-Alphanumerische zu -
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cubory';
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function shortPath(p) {
  if (!p) return '';
  const parts = p.split(/[/\\]/).filter(Boolean);
  return (p.startsWith('/') ? '/' : '') + parts.slice(-2).join('/');
}

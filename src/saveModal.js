// Gemeinsames "Erzeugen und Speichern"-Modal für HD-Shot und Export. Zeigt eine
// Vorschau, eine Optionsreihe (Auflösung bzw. Format), einen Dateinamen und
// einen Inline-Ordnerwähler; speichert in den gewählten Ordner ohne System-
// Dialog und kann in die Zwischenablage kopieren. Der konkrete Inhalt kommt
// über die Konfiguration, damit es kein zweites, dupliziertes Modal braucht.
import { t } from './i18n.js';
import { esc, crumbs, shortPath } from './modalUtils.js';

let cfg = null;   // aktive Konfiguration
let modal = null;
let st = null;    // { option, busy, gen, dir, saved, browse }

// Test-Hook wie window.__openPath: liefert die aktuelle Erzeugung
if (typeof window !== 'undefined') window.__saveModalGen = () => st?.gen;

/**
 * @param cfg {
 *   title, optionsLabel,
 *   options: [{ value, label }],
 *   initialOption,
 *   defaultName: () => string,           // Basisname ohne Endung
 *   generate: async (value) => ({ base64, ext, previewUrl, text? }),
 *   lastDir: async () => res,
 *   saveTo:  async ({ base64, dir, filename, ext }) => res,
 *   copy?:   async (gen) => res,         // wenn gesetzt: Kopieren-Knopf
 *   copyable?: (gen) => boolean,         // ob Kopieren für diese Erzeugung geht
 *   reveal:  (path) => void,
 * }
 */
export function openSaveModal(config) {
  if (modal) return;
  cfg = config;
  modal = document.createElement('div');
  modal.className = 'save-modal';
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.body.appendChild(modal);
  window.addEventListener('keydown', onEsc);

  st = { option: cfg.initialOption, busy: true, gen: null, dir: null, saved: null, browse: null };
  renderShell();
  init();
}

function onEsc(e) { if (e.key === 'Escape') close(); }

function close() {
  modal?.remove();
  modal = null; st = null; cfg = null;
  window.removeEventListener('keydown', onEsc);
}

// Every await can outlive the modal (Escape, or another modal opened right
// after), so each step checks that its session `my` is still the current one.
async function init() {
  const my = st;
  const res = await cfg.lastDir();
  if (st !== my) return;
  st.dir = res.ok ? res.data : null;
  updateFoot();
  browse(st.dir);
  await generate();
}

/** Inhalt in der gewählten Option erzeugen - nur die Vorschau tauscht, damit
 *  nichts flackert. */
async function generate() {
  const my = st;
  const run = cfg.generate;
  st.busy = true;
  updatePreview();
  updateControls();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (st !== my) return;
  let gen = null;
  try {
    gen = await run(my.option);
  } catch {
    gen = null;
  }
  if (st !== my) return;
  st.gen = gen;
  st.busy = false;
  st.saved = null;
  updatePreview();
  updateExt();
  updateControls();
  updateFoot();
}

async function browse(dirPath) {
  const my = st;
  const res = await window.cubory.files.listDir(dirPath ?? st.dir ?? null);
  if (st !== my || !res.ok) return;
  st.dir = res.data.path;
  st.browse = res.data;
  st.saved = null;
  renderBrowse();
  updateControls();
  updateFoot();
}

/* ── Aufbau (einmalig) ───────────────────────────────────────────────────── */

function renderShell() {
  if (!modal) return;
  modal.innerHTML = `<div class="hs-card glass sheet sheet-corners">
    <div class="hs-head">
      <h2>${esc(cfg.title)}</h2>
      <button class="hs-x" id="sm-close" title="${esc(t('about.close'))}">✕</button>
    </div>

    <div class="hs-preview" id="sm-preview"></div>

    <div class="hs-scales">
      <span class="hs-label">${esc(cfg.optionsLabel)}</span>
      ${cfg.options.map((o) => `<button class="hs-scale" data-opt="${esc(o.value)}">${esc(o.label)}</button>`).join('')}
    </div>

    <div class="hs-field">
      <span class="hs-label">${esc(t('hdshot.filename'))}</span>
      <span class="hs-name-wrap"><input type="text" id="sm-name" class="hs-name" value="${esc(cfg.defaultName())}"
        spellcheck="false" /><span class="hs-ext" id="sm-ext"></span></span>
    </div>

    <div class="hs-field hs-folder">
      <span class="hs-label">${esc(t('hdshot.folder'))}</span>
      <div class="hs-shortcuts" id="sm-shortcuts"></div>
    </div>

    <div id="sm-browse"></div>

    <div class="hs-foot">
      <span id="sm-status"></span>
      <div class="hs-actions">
        ${cfg.copy ? `<button class="btn btn-ghost" id="sm-copy">${esc(t('hdshot.copy'))}</button>` : ''}
        <button class="btn btn-primary" id="sm-save">${esc(t('hdshot.save'))}</button>
      </div>
    </div>
  </div>`;

  modal.querySelector('#sm-close').addEventListener('click', close);
  modal.querySelectorAll('.hs-scale').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.opt !== String(st.option) && !st.busy) { st.option = b.dataset.opt; generate(); }
  }));
  modal.querySelector('#sm-save').addEventListener('click', onSave);
  modal.querySelector('#sm-copy')?.addEventListener('click', onCopy);
  modal.querySelector('#sm-name').addEventListener('input', () => { st.saved = null; updateFoot(); });

  updatePreview();
  updateExt();
  updateControls();
  renderBrowse();
  updateFoot();
}

/* ── Teil-Updater ────────────────────────────────────────────────────────── */

function updatePreview() {
  const el = modal?.querySelector('#sm-preview');
  if (!el) return;
  if (st.busy) {
    el.innerHTML = `<div class="hs-loader"><div class="spinner"></div><span>${esc(t('hdshot.generating'))}</span></div>`;
  } else if (st.gen?.previewUrl) {
    el.innerHTML = `<img src="${st.gen.previewUrl}" alt="" class="${st.gen.light ? 'sm-doc' : ''}" /><span class="hs-dims mono">${esc(genInfo())}</span>`;
  } else {
    el.innerHTML = `<div class="hs-loader"><span>${esc(t('hdshot.saveError'))}</span></div>`;
  }
}

function updateExt() {
  const el = modal?.querySelector('#sm-ext');
  if (el) el.textContent = st.gen ? '.' + st.gen.ext : '';
}

function updateControls() {
  if (!modal) return;
  modal.querySelectorAll('.hs-scale').forEach((b) => {
    b.classList.toggle('on', b.dataset.opt === String(st.option));
    b.disabled = st.busy;
  });
  const copy = modal.querySelector('#sm-copy');
  const save = modal.querySelector('#sm-save');
  if (copy) copy.disabled = st.busy || !st.gen || (cfg.copyable ? !cfg.copyable(st.gen) : false);
  if (save) save.disabled = st.busy || !st.gen || !st.browse;
}

function renderBrowse() {
  const el = modal?.querySelector('#sm-browse');
  if (!el) return;
  const b = st.browse;

  const scut = modal.querySelector('#sm-shortcuts');
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
  const el = modal?.querySelector('#sm-status');
  if (!el) return;
  if (st.saved) {
    el.innerHTML = `<span class="hs-saved">✓ ${esc(t('hdshot.saved'))} · <button class="hs-reveal" id="sm-reveal">${esc(t('hdshot.reveal'))}</button></span>`;
    el.querySelector('#sm-reveal').addEventListener('click', () => { if (st.saved) cfg.reveal(st.saved); });
  } else {
    el.innerHTML = `<span class="hs-savepath mono" title="${esc(st.dir || '')}">${esc(shortPath(st.dir))}</span>`;
  }
}

/* ── Aktionen ────────────────────────────────────────────────────────────── */

async function onSave() {
  if (!st.gen) return;
  const filename = modal.querySelector('#sm-name')?.value || '';
  const my = st;
  const res = await cfg.saveTo({ base64: st.gen.base64, dir: st.dir, filename, ext: st.gen.ext });
  if (st !== my) return;
  if (res.ok && res.data) {
    st.saved = res.data.path;
    updateFoot();
  } else {
    flash('#sm-save', t('hdshot.saveError'));
  }
}

async function onCopy() {
  if (!st.gen || !cfg.copy) return;
  const res = await cfg.copy(st.gen);
  flash('#sm-copy', res?.ok ? t('hdshot.copied') : t('hdshot.copyError'), res?.ok);
}

function flash(sel, text, ok = false) {
  const btn = modal?.querySelector(sel);
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = (ok ? '✓ ' : '') + text;
  btn.classList.toggle('hs-ok', ok);
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('hs-ok'); }, 1600);
}

/** Info-Badge auf dem Vorschaubild: entweder was die Erzeugung liefert
 *  (z.B. Pixelmaße), sonst die Dateigröße. */
function genInfo() {
  if (!st.gen) return '';
  if (st.gen.info) return st.gen.info;
  const bytes = Math.floor((st.gen.base64.length * 3) / 4);
  const size = bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${st.gen.ext.toUpperCase()} · ${size}`;
}

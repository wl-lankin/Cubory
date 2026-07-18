// Integrierter Datei-Browser im Cubory-Design: Schnellzugriff, Breadcrumb,
// nur CAD-Dateien, Zuletzt-geöffnet. Der native Dialog bleibt als Fallback.
import { t } from './i18n.js';

let openFile = null; // (path) => Promise - vom Aufrufer injiziert
let systemDialog = null;
let modal = null;

export function initFileBrowser(openFileFn, systemDialogFn) {
  openFile = openFileFn;
  systemDialog = systemDialogFn;
}

export async function openFileBrowser() {
  if (modal) return;
  modal = document.createElement('div');
  modal.id = 'file-browser';
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.body.appendChild(modal);
  window.addEventListener('keydown', onEsc);
  await render();
}

function onEsc(e) {
  if (e.key === 'Escape') close();
}

function close() {
  modal?.remove();
  modal = null;
  window.removeEventListener('keydown', onEsc);
}

async function render(dirPath) {
  const [listRes, recentRes] = await Promise.all([
    window.cubory.files.listDir(dirPath ?? null),
    window.cubory.files.recent(),
  ]);
  if (!modal) return;
  if (!listRes.ok) {
    modal.querySelector('.fb-list')?.replaceChildren(
      Object.assign(document.createElement('p'), { className: 'fb-empty', textContent: listRes.error.message }));
    return;
  }
  const d = listRes.data;
  const recent = recentRes.ok ? recentRes.data : [];
  const crumbs = breadcrumbs(d.path);

  modal.innerHTML = `<div class="fb-card glass">
    <div class="fb-head">
      <h2>${esc(t('browser.title'))}</h2>
      <div class="fb-shortcuts">
        ${d.shortcuts.map((s) => `<button class="fb-sc" data-path="${esc(s.path)}">${esc(t('browser.' + s.key))}</button>`).join('')}
      </div>
    </div>
    ${recent.length ? `<div class="fb-recent">
      <span class="fb-label">${esc(t('browser.recent'))}</span>
      ${recent.slice(0, 5).map((r) => `<button class="fb-chip" data-file="${esc(r.path)}" title="${esc(r.path)}">${esc(r.name)}</button>`).join('')}
    </div>` : ''}
    <div class="fb-crumbs">
      ${crumbs.map((c, i) => `<button class="fb-crumb" data-path="${esc(c.path)}">${esc(c.name)}</button>${i < crumbs.length - 1 ? '<span class="fb-sep">›</span>' : ''}`).join('')}
    </div>
    <div class="fb-list">
      ${d.parent ? `<div class="fb-row fb-dir" data-dir="${esc(d.parent)}"><span class="fb-ic">…</span><span class="fb-name">..</span></div>` : ''}
      ${d.dirs.map((x) => `<div class="fb-row fb-dir" data-dir="${esc(x.path)}"><span class="fb-ic">▸</span><span class="fb-name">${esc(x.name)}</span></div>`).join('')}
      ${d.files.map((x) => `<div class="fb-row fb-file" data-file="${esc(x.path)}">
        <span class="fb-badge">${esc(x.ext)}</span>
        <span class="fb-name">${esc(x.name)}</span>
        <span class="fb-meta">${fmtSize(x.size)} · ${new Date(x.mtime).toLocaleDateString()}</span>
      </div>`).join('')}
      ${!d.dirs.length && !d.files.length ? `<p class="fb-empty">${esc(t('browser.empty'))}</p>` : ''}
    </div>
    <div class="fb-foot">
      <button class="btn btn-ghost" id="fb-system">${esc(t('browser.system'))}</button>
      <button class="btn btn-ghost" id="fb-close">${esc(t('about.close'))}</button>
    </div>
  </div>`;

  modal.querySelectorAll('[data-dir], .fb-sc, .fb-crumb').forEach((el) => {
    el.addEventListener('click', () => render(el.dataset.dir || el.dataset.path));
  });
  modal.querySelectorAll('[data-file]').forEach((el) => {
    el.addEventListener('click', async () => {
      close();
      await openFile(el.dataset.file);
    });
  });
  modal.querySelector('#fb-system').addEventListener('click', async () => {
    close();
    await systemDialog();
  });
  modal.querySelector('#fb-close').addEventListener('click', close);
}

function breadcrumbs(p) {
  const parts = p.split(/[\\/]/).filter(Boolean);
  const isWin = p.includes('\\');
  const out = [];
  let acc = isWin ? '' : '/';
  out.push({ name: isWin ? parts[0] : '/', path: isWin ? parts[0] + '\\' : '/' });
  for (let i = isWin ? 1 : 0; i < parts.length; i++) {
    acc = isWin ? `${acc || parts[0]}${i === 0 ? '' : '\\'}${i === 0 ? '' : parts[i]}` : `${acc}${parts[i]}/`;
    if (!isWin) out.push({ name: parts[i], path: acc });
    else if (i > 0) out.push({ name: parts[i], path: out[out.length - 1].path + parts[i] + '\\' });
  }
  return out.slice(-4); // maximal 4 Ebenen anzeigen
}

function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

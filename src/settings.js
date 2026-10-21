// Optionen-Dialog im Zeichnungsblatt-Stil: Autostart, Sitzung, Tray,
// Standardprogramm, Sprache, Intro, Crash-Reports, Update-Check.
import { t, LOCALES, storedLang, setLang } from './i18n.js';
import { openChangelog } from './changelogModal.js';

let modal = null;
let onLangChange = null;

export function initSettings(langChangeCb) {
  onLangChange = langChangeCb;
  document.getElementById('btn-settings').addEventListener('click', () => {
    modal ? close() : open();
  });
}

function close() {
  modal?.remove();
  modal = null;
  window.removeEventListener('keydown', onEsc);
}

function onEsc(e) {
  if (e.key === 'Escape') close();
}

async function open() {
  const s = await window.cubory.settings.get();
  modal = document.createElement('div');
  modal.id = 'account-modal'; // gleiche Overlay-Optik
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  window.addEventListener('keydown', onEsc);

  const toggle = (key, label, checked) => `
    <label class="set-row">
      <span>${esc(label)}</span>
      <input type="checkbox" class="set-toggle" data-key="${key}" ${checked ? 'checked' : ''} />
    </label>`;

  modal.innerHTML = `<div class="account-card glass sheet sheet-corners">
    <h2 class="account-title">${esc(t('settings.title'))}</h2>

    ${toggle('autostart', t('settings.autostart'), s.autostart)}
    ${toggle('restore_tabs', t('settings.restoreTabs'), s.restore_tabs)}
    ${s.platform !== 'darwin' ? toggle('close_to_tray', t('settings.tray'), s.close_to_tray) : ''}
    ${toggle('intro', t('settings.intro'), s.intro)}

    <h3 class="account-subtitle">${esc(t('settings.language'))}</h3>
    <button id="set-lang-btn" class="account-input set-lang-btn">
      <span>${esc(storedLang() === 'system' ? t('lang.system') : (LOCALES.find(([c]) => c === storedLang())?.[1] ?? storedLang()))}</span>
      <svg class="lang-chev-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </button>

    <h3 class="account-subtitle">${esc(t('settings.defaultApp'))}</h3>
    ${s.platform === 'win32'
      ? `<button class="btn btn-ghost" id="set-defaultapp">${esc(t('settings.defaultAppBtn'))}</button>`
      : `<p class="account-hint">${esc(t('settings.defaultAppMacHint'))}</p>`}

    <h3 class="account-subtitle" style="margin-bottom:2px">${esc(t('settings.updates'))}</h3>
    <div class="set-row" style="cursor:default;padding-top:0">
      <span class="account-hint" id="set-update-state">${esc(t('settings.upToDate'))}</span>
      <button class="btn btn-ghost" id="set-check-updates" style="padding:6px 14px">${esc(t('settings.checkUpdates'))}</button>
    </div>

    <div class="set-row" style="cursor:default">
      <span>${esc(t('settings.history'))}</span>
      <button class="btn btn-ghost" id="set-history" style="padding:6px 14px">${esc(t('settings.historyBtn'))}</button>
    </div>

    <div class="account-actions" style="justify-content:center">
      <button class="btn btn-ghost" id="set-close">${esc(t('about.close'))}</button>
    </div>
  </div>
  <div id="set-lang-list" class="set-lang-list glass" hidden>
    ${[['system', t('lang.system')], ...LOCALES].map(([code, name]) =>
      `<button class="lang-item${storedLang() === code ? ' on' : ''}" data-lang="${code}">
        <span>${esc(name)}</span>${storedLang() === code ? '<span class="lang-check">✓</span>' : ''}
      </button>`).join('')}
  </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll('.set-toggle').forEach((box) => {
    box.addEventListener('change', async () => {
      await window.cubory.settings.set(box.dataset.key, box.checked);
      if (box.dataset.key === 'intro') localStorage.setItem('cubory-intro', box.checked ? 'on' : 'off');
    });
  });

  const langBtn = modal.querySelector('#set-lang-btn');
  const langList = modal.querySelector('#set-lang-list');
  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langList.hidden = !langList.hidden;
    if (!langList.hidden) {
      const r = langBtn.getBoundingClientRect();
      langList.style.left = r.left + 'px';
      langList.style.width = r.width + 'px';
      const below = innerHeight - r.bottom - 16;
      if (below < 240 && r.top > 260) {
        langList.style.top = '';
        langList.style.bottom = (innerHeight - r.top + 6) + 'px';
      } else {
        langList.style.bottom = '';
        langList.style.top = (r.bottom + 6) + 'px';
      }
      langList.querySelector('.lang-item.on')?.scrollIntoView({ block: 'center' });
    }
  });
  modal.addEventListener('click', (e) => {
    if (!langList.hidden && !langList.contains(e.target) && e.target !== langBtn) langList.hidden = true;
  });
  langList.querySelectorAll('.lang-item').forEach((item) => {
    item.addEventListener('click', () => {
      setLang(item.dataset.lang);
      onLangChange?.();
      close();
      open(); // Dialog in neuer Sprache neu aufbauen
    });
  });

  modal.querySelector('#set-defaultapp')?.addEventListener('click', () => {
    window.cubory.settings.openDefaultApps();
  });

  modal.querySelector('#set-check-updates').addEventListener('click', () => {
    const el = document.getElementById('set-update-state');
    el.textContent = '…';
    window.cubory.update.check().then((st) => {
      el.textContent = ['ready', 'manual', 'downloading'].includes(st?.status)
        ? t('update.available', { v: st.version })
        : t('settings.upToDate');
    });
  });

  modal.querySelector('#set-history').addEventListener('click', async () => {
    const info = await window.cubory.appInfo();
    close();
    openChangelog({ installedVersion: info.version });
  });

  modal.querySelector('#set-close').addEventListener('click', close);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

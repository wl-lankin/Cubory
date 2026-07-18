// Optionen-Dialog im Zeichnungsblatt-Stil: Autostart, Sitzung, Tray,
// Standardprogramm, Sprache, Intro, Crash-Reports, Update-Check.
import { t, LOCALES, storedLang, setLang } from './i18n.js';

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
    ${toggle('crash_reports', t('about.crash'), s.crash_reports)}

    <h3 class="account-subtitle">${esc(t('settings.language'))}</h3>
    <button id="set-lang-btn" class="account-input set-lang-btn">
      <span>${esc(storedLang() === 'system' ? t('lang.system') : (LOCALES.find(([c]) => c === storedLang())?.[1] ?? storedLang()))}</span>
      <span class="lang-chev">▾</span>
    </button>
    <div id="set-lang-list" class="set-lang-list" hidden>
      ${[['system', t('lang.system')], ...LOCALES].map(([code, name]) =>
        `<button class="lang-item${storedLang() === code ? ' on' : ''}" data-lang="${code}">
          <span>${esc(name)}</span>${storedLang() === code ? '<span class="lang-check">✓</span>' : ''}
        </button>`).join('')}
    </div>

    <h3 class="account-subtitle">${esc(t('settings.defaultApp'))}</h3>
    ${s.platform === 'win32'
      ? `<button class="btn btn-ghost" id="set-defaultapp">${esc(t('settings.defaultAppBtn'))}</button>`
      : `<p class="account-hint">${esc(t('settings.defaultAppMacHint'))}</p>`}

    <h3 class="account-subtitle" style="margin-bottom:2px">${esc(t('settings.updates'))}</h3>
    <div class="set-row" style="cursor:default;padding-top:0">
      <span class="account-hint" id="set-update-state">${esc(t('settings.upToDate'))}</span>
      <button class="btn btn-ghost" id="set-check-updates" style="padding:6px 14px">${esc(t('settings.checkUpdates'))}</button>
    </div>

    <div class="account-actions" style="justify-content:center">
      <button class="btn btn-ghost" id="set-close">${esc(t('about.close'))}</button>
    </div>
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
  langBtn.addEventListener('click', () => {
    langList.hidden = !langList.hidden;
    if (!langList.hidden) langList.querySelector('.lang-item.on')?.scrollIntoView({ block: 'center' });
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
    window.cubory.update.state().then(() => {
      setTimeout(async () => {
        const st = await window.cubory.update.state();
        el.textContent = st?.status === 'ready' || st?.status === 'manual'
          ? t('update.available', { v: st.version })
          : t('settings.upToDate');
      }, 1500);
    });
  });

  modal.querySelector('#set-close').addEventListener('click', close);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

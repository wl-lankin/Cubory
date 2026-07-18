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
    <select id="set-lang" class="account-input">
      <option value="system">${esc(t('lang.system'))}</option>
      ${LOCALES.map(([code, name]) => `<option value="${code}"${storedLang() === code ? ' selected' : ''}>${esc(name)}</option>`).join('')}
    </select>

    <h3 class="account-subtitle">${esc(t('settings.defaultApp'))}</h3>
    ${s.platform === 'win32'
      ? `<button class="btn btn-ghost" id="set-defaultapp">${esc(t('settings.defaultAppBtn'))}</button>`
      : `<p class="account-hint">${esc(t('settings.defaultAppMacHint'))}</p>`}

    <h3 class="account-subtitle">${esc(t('settings.updates'))}</h3>
    <div class="set-row" style="cursor:default">
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

  modal.querySelector('#set-lang').addEventListener('change', (e) => {
    setLang(e.target.value);
    onLangChange?.();
    close();
    open(); // Dialog in neuer Sprache neu aufbauen
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

// Über-Fenster: Version (öffnet den Versionsverlauf), Entwickler, rechtliche Links.
import { t } from './i18n.js';
import { openChangelog } from './changelogModal.js';
import appiconUrl from './assets/appicon.png';
import wordmarkUrl from './assets/wordmark.png';

export function initAbout() {
  document.getElementById('btn-about')?.addEventListener('click', async () => {
    const info = await window.cubory.appInfo();
    const overlay = document.createElement('div');
    overlay.id = 'account-modal';
    overlay.innerHTML = `<div class="account-card glass sheet sheet-corners" style="text-align:center">
            <img src="${appiconUrl}" alt="" style="width:64px;height:64px;margin-bottom:12px" />
      <img src="${wordmarkUrl}" alt="Cubory" style="height:24px;width:auto;margin:0 auto 6px;display:block" />
      <p class="account-hint" style="margin-bottom:14px">The modern CAD viewer</p>
      <div class="account-row"><span>${escapeHtml(t('about.version'))}</span>
        <button type="button" id="about-version" class="about-version-btn">${escapeHtml(info.version)}<span class="about-version-chev">›</span></button></div>
      <div class="account-row"><span>${escapeHtml(t('about.dev'))}</span>
        <a href="#" id="about-link" style="color:var(--accent-1);text-decoration:none">Wolfgang Linz</a></div>
      <p class="account-hint" style="margin-top:14px">
        <a href="#" id="about-imprint" style="color:var(--text-faint)">${escapeHtml(t('about.imprint'))}</a> ·
        <a href="#" id="about-privacy" style="color:var(--text-faint)">${escapeHtml(t('about.privacy'))}</a>
      </p>
      <div class="account-actions" style="justify-content:center">
        <button class="btn btn-ghost" id="about-close">${escapeHtml(t('about.close'))}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#about-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#about-version').addEventListener('click', () => {
      overlay.remove();
      openChangelog({ installedVersion: info.version });
    });
    overlay.querySelector('#about-link').addEventListener('click', (e) => {
      e.preventDefault();
      window.cubory.openExternal('https://wolfgang-linz.de');
    });
    overlay.querySelector('#about-imprint').addEventListener('click', (e) => {
      e.preventDefault();
      window.cubory.openExternal('https://cubory.app/impressum.html');
    });
    overlay.querySelector('#about-privacy').addEventListener('click', (e) => {
      e.preventDefault();
      window.cubory.openExternal('https://cubory.app/datenschutz.html');
    });
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

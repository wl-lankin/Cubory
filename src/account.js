// Account-UI: Titelleisten-Button, Konto-Modal (Login/Registrierung bzw.
// Kontoübersicht mit Geräten) und der Offline-Verifikations-Banner.
import { t } from './i18n.js';
import appiconUrl from './assets/appicon.png';
import wordmarkUrl from './assets/wordmark.png';

let state = { signedIn: false, kind: 'anonymous', entitlements: [] };
let modal = null;

export function currentAccount() { return state; }

export function can(entitlement) {
  return state.entitlements.includes(entitlement);
}

export function openAccountModal() {
  if (!modal) openModal();
}

export function initAccount(onLicenseChange) {
  const btn = document.getElementById('btn-account');
  btn.addEventListener('click', () => (modal ? closeModal() : openModal()));

  window.cubory.account.onChange((s) => {
    state = s;
    renderButton();
    renderBanner();
    onLicenseChange?.(s);
    if (modal) renderModal();
  });

  window.cubory.account.state().then((res) => {
    if (res.ok) {
      state = res.data;
      renderButton();
      renderBanner();
      onLicenseChange?.(state);
    }
  });
}

function planLabel() {
  return t(`account.plan.${state.kind}`) || t('account.plan.free');
}

function renderButton() {
  const btn = document.getElementById('btn-account');
  if (!state.signedIn) {
    btn.innerHTML = `<span class="account-icon">●</span>${escapeHtml(t('account.signIn'))}`;
    btn.classList.remove('pro');
    return;
  }
  const isPro = state.entitlements.length > 0;
  btn.classList.toggle('pro', isPro);
  btn.innerHTML = `<span class="account-icon">●</span>${escapeHtml(state.user?.name || '')}
    <span class="account-badge">${escapeHtml(planLabel())}</span>`;
}

function renderBanner() {
  let banner = document.getElementById('verify-banner');
  if (!state.needsVerification) {
    banner?.remove();
    return;
  }
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'verify-banner';
    document.getElementById('viewport-wrap').appendChild(banner);
  }
  banner.textContent = t('account.verifyBanner');
}

/* ── Modal ───────────────────────────────────────────────────────────────── */

function openModal() {
  modal = document.createElement('div');
  modal.id = 'account-modal';
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.body.appendChild(modal);
  renderModal();
}

function closeModal() {
  modal?.remove();
  modal = null;
}

function renderModal() {
  if (!modal) return;
  modal.innerHTML = `<div class="account-card glass sheet sheet-corners">${
    state.signedIn ? accountView() : authView()
  }</div>`;
  wireModal();
}

function authView(tab = 'login') {
  return `
    <h2 class="account-title">${escapeHtml(t('account.title'))}</h2>
    <div class="account-tabs">
      <button class="account-tab ${tab === 'login' ? 'on' : ''}" data-tab="login">${escapeHtml(t('account.tabLogin'))}</button>
      <button class="account-tab ${tab === 'register' ? 'on' : ''}" data-tab="register">${escapeHtml(t('account.tabRegister'))}</button>
    </div>
    <form id="account-form" data-mode="${tab}">
      ${tab === 'register' ? `<input class="account-input" name="name" placeholder="${escapeHtml(t('account.name'))}" required />` : ''}
      <input class="account-input" name="email" type="email" placeholder="${escapeHtml(t('account.email'))}" required />
      <input class="account-input" name="password" type="password" placeholder="${escapeHtml(t('account.password'))}" minlength="10" required />
      ${tab === 'register' ? `<p class="account-hint">${escapeHtml(t('account.registerHint'))}</p>` : ''}
      <p class="account-error" id="account-error" hidden></p>
      <button class="btn btn-primary account-submit">${escapeHtml(t(tab === 'login' ? 'account.tabLogin' : 'account.tabRegister'))}</button>
    </form>`;
}

function verifySection() {
  if (state.user?.email_verified) return '';
  return `
    <h3 class="account-subtitle">${escapeHtml(t('verify.title'))}</h3>
    <p class="account-hint" style="margin-bottom:8px">${escapeHtml(t('verify.sent', { email: state.user?.email || '' }))}</p>
    <form id="verify-form" style="display:flex;gap:8px">
      <input class="account-input verify-code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"
        placeholder="${escapeHtml(t('verify.code'))}" required style="flex:1;text-align:center;letter-spacing:.4em;font-family:ui-monospace,Menlo,monospace" />
      <button class="btn btn-primary" style="padding:9px 18px">${escapeHtml(t('verify.submit'))}</button>
    </form>
    <p class="account-error" id="verify-error" hidden></p>
    <p class="account-hint" style="margin-top:8px"><a href="#" id="verify-resend" style="color:var(--accent-1)">${escapeHtml(t('verify.resend'))}</a>
      <span id="verify-resent" hidden> · ${escapeHtml(t('verify.resent'))}</span></p>`;
}

function accountView() {
  const expires = state.licenseExpiresAt
    ? new Date(state.licenseExpiresAt).toLocaleDateString()
    : (state.kind === 'lifetime' ? t('account.lifetime') : '');
  return `
    <h2 class="account-title">${escapeHtml(t('account.title'))}</h2>
    <div class="account-row"><span>${escapeHtml(t('account.loggedInAs'))}</span>
      <span>${escapeHtml(state.user?.name || '')} · ${escapeHtml(state.user?.email || '')}</span></div>
    <div class="account-row"><span>${escapeHtml(t('account.license'))}</span>
      <span class="account-badge big">${escapeHtml(planLabel())}</span></div>
    ${state.trialDaysLeft != null ? `<div class="account-row"><span></span><span>${escapeHtml(t('account.trialDaysLeft', { n: state.trialDaysLeft }))}</span></div>` : ''}
    ${verifySection()}
    ${expires ? `<div class="account-row"><span>${escapeHtml(t('account.expires'))}</span><span>${escapeHtml(expires)}</span></div>` : ''}
    ${state.entitlements.length === 0 ? `
    <h3 class="account-subtitle">${escapeHtml(t('account.upgradeTitle'))}</h3>
    <div class="account-plans">
      <button class="account-plan" data-plan="monthly">${escapeHtml(t('plan.monthly'))}</button>
      <button class="account-plan" data-plan="yearly">${escapeHtml(t('plan.yearly'))}</button>
      <button class="account-plan" data-plan="lifetime">${escapeHtml(t('plan.lifetime'))}</button>
    </div>` : ''}
    <h3 class="account-subtitle">${escapeHtml(t('account.devices'))}</h3>
    <ul class="account-devices" id="account-devices"><li class="account-hint">…</li></ul>
    <div class="account-actions" style="justify-content:space-between">
      <button class="btn btn-ghost account-danger" id="account-delete">${escapeHtml(t('account.delete'))}</button>
      <button class="btn btn-ghost" id="account-logout">${escapeHtml(t('account.logout'))}</button>
    </div>`;
}

function wireModal() {
  modal.querySelectorAll('.account-tab').forEach((el) => {
    el.addEventListener('click', () => {
      modal.querySelector('.account-card').innerHTML = authView(el.dataset.tab);
      wireModal();
    });
  });

  const form = modal.querySelector('#account-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = modal.querySelector('#account-error');
      errEl.hidden = true;
      form.querySelector('.account-submit').disabled = true;
      const res = form.dataset.mode === 'login'
        ? await window.cubory.account.login(fd.get('email'), fd.get('password'))
        : await window.cubory.account.register(fd.get('name'), fd.get('email'), fd.get('password'));
      if (!res.ok) {
        errEl.textContent = res.error.message;
        errEl.hidden = false;
        form.querySelector('.account-submit').disabled = false;
        return;
      }
      state = res.data;
      renderButton();
      renderModal();
    });
  }

  const verifyForm = modal.querySelector('#verify-form');
  if (verifyForm) {
    verifyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = modal.querySelector('#verify-error');
      errEl.hidden = true;
      const res = await window.cubory.account.verifyEmail(new FormData(verifyForm).get('code'));
      if (!res.ok) {
        errEl.textContent = res.error.message;
        errEl.hidden = false;
        return;
      }
      state = res.data;
      renderModal();
    });
    modal.querySelector('#verify-resend')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await window.cubory.account.resendCode();
      modal.querySelector('#verify-resent').hidden = false;
    });
  }

  modal.querySelectorAll('.account-plan').forEach((btn) => {
    btn.addEventListener('click', () => window.cubory.account.checkout(btn.dataset.plan));
  });

  modal.querySelector('#account-delete')?.addEventListener('click', async () => {
    const password = await confirmModal(t('account.deleteConfirm'), t('account.delete'), true);
    if (!password) return;
    const res = await window.cubory.account.deleteAccount(password);
    if (!res.ok) {
      alert(res.error.message);
      return;
    }
    closeModal();
  });

  modal.querySelector('#account-logout')?.addEventListener('click', async () => {
    await window.cubory.account.logout();
    closeModal();
  });

  if (state.signedIn) loadDevices();
}

async function loadDevices() {
  const list = modal?.querySelector('#account-devices');
  if (!list) return;
  const res = await window.cubory.account.devices();
  if (!modal || !res.ok) return;
  list.innerHTML = res.data.map((d) => `
    <li>
      <span class="device-name">${escapeHtml(d.name)}${d.current ? ` · ${escapeHtml(t('account.thisDevice'))}` : ''}</span>
      <span class="device-meta">${escapeHtml(d.os)}</span>
      <button class="device-remove" data-id="${d.id}">${escapeHtml(t('account.deactivate'))}</button>
    </li>`).join('');
  list.querySelectorAll('.device-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await window.cubory.account.deactivateDevice(btn.dataset.id);
      loadDevices();
    });
  });
}

// Bestätigungsdialog im App-Stil (ersetzt natives confirm).
// Mit `withPassword` verlangt er zusätzlich das Kontopasswort und
// liefert dieses zurück (sonst true/false).
function confirmModal(text, confirmLabel, withPassword = false) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.id = 'confirm-modal';
    ov.innerHTML = `<div class="account-card glass sheet sheet-corners" style="width:400px">
      <p style="font-size:13.5px;line-height:1.7;color:var(--text-muted);margin-bottom:${withPassword ? '14' : '20'}px">${escapeHtml(text)}</p>
      ${withPassword ? `<input class="account-input" id="cm-pw" type="password"
        placeholder="${escapeHtml(t('account.password'))}" autofocus />
        <p class="account-error" id="cm-err" hidden></p>` : ''}
      <div class="account-actions" style="justify-content:flex-end;gap:10px;margin-top:16px">
        <button class="btn btn-ghost" id="cm-no">${escapeHtml(t('common.cancel'))}</button>
        <button class="btn btn-ghost account-danger" id="cm-yes" style="border:1px solid rgba(255,110,130,.4)">${escapeHtml(confirmLabel)}</button>
      </div></div>`;
    document.body.appendChild(ov);
    const pw = ov.querySelector('#cm-pw');
    pw?.focus();
    const done = (v) => { ov.remove(); resolve(v); };
    ov.querySelector('#cm-no').addEventListener('click', () => done(false));
    ov.querySelector('#cm-yes').addEventListener('click', () => {
      if (!withPassword) return done(true);
      if (!pw.value) { pw.focus(); return; }
      done(pw.value);
    });
    pw?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && pw.value) done(pw.value);
    });
    ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
    window.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { done(false); window.removeEventListener('keydown', esc); }
    });
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}


/* ── About-Modal ─────────────────────────────────────────────────────────── */

export function initAbout() {
  document.getElementById('btn-about')?.addEventListener('click', async () => {
    const info = await window.cubory.appInfo();
    const overlay = document.createElement('div');
    overlay.id = 'account-modal';
    overlay.innerHTML = `<div class="account-card glass sheet sheet-corners" style="text-align:center">
            <img src="${appiconUrl}" alt="" style="width:64px;height:64px;margin-bottom:12px" />
      <img src="${wordmarkUrl}" alt="Cubory" style="height:24px;width:auto;margin:0 auto 6px;display:block" />
      <p class="account-hint" style="margin-bottom:14px">The modern CAD viewer</p>
      <div class="account-row"><span>${escapeHtml(t('about.version'))}</span><span>${escapeHtml(info.version)}</span></div>
      <div class="account-row"><span>${escapeHtml(t('about.dev'))}</span>
        <a href="#" id="about-link" style="color:var(--accent-1);text-decoration:none">Wolfgang Linz</a></div>
      <label class="account-hint" style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:14px;cursor:pointer">
        <input type="checkbox" id="about-crash" style="accent-color:var(--accent-1)" />
        ${escapeHtml(t('about.crash'))}
      </label>
      <p class="account-hint" style="margin-top:10px">
        <a href="#" id="about-imprint" style="color:var(--text-faint)">${escapeHtml(t('about.imprint'))}</a> ·
        <a href="#" id="about-privacy" style="color:var(--text-faint)">${escapeHtml(t('about.privacy'))}</a> ·
        <a href="#" id="about-terms" style="color:var(--text-faint)">${escapeHtml(t('about.terms'))}</a>
      </p>
      <div class="account-actions" style="justify-content:center">
        <button class="btn btn-ghost" id="about-close">${escapeHtml(t('about.close'))}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#about-close').addEventListener('click', () => overlay.remove());
    const crashBox = overlay.querySelector('#about-crash');
    window.cubory.crash.optIn().then((on) => { crashBox.checked = on; });
    crashBox.addEventListener('change', () => window.cubory.crash.setOptIn(crashBox.checked));
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
    overlay.querySelector('#about-terms').addEventListener('click', (e) => {
      e.preventDefault();
      window.cubory.openExternal('https://cubory.app/agb.html');
    });
  });
}

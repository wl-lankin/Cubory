// Upgrade-Nudge für Free-Nutzer: dezente Glass-Card beim Start,
// maximal einmal alle 24 Stunden, nie während der Arbeit.
import { t } from './i18n.js';

const NUDGE_KEY = 'cubory-nudge-at';
const NUDGE_INTERVAL = 24 * 60 * 60 * 1000;

export function maybeShowNudge(accountState, { onUpgrade }) {
  const isFree = accountState.kind === 'free' || accountState.kind === 'anonymous';
  if (!isFree) return false;
  const last = Number(localStorage.getItem(NUDGE_KEY) || 0);
  if (Date.now() - last < NUDGE_INTERVAL) return false;
  localStorage.setItem(NUDGE_KEY, String(Date.now()));
  show(onUpgrade);
  return true;
}

function show(onUpgrade) {
  const overlay = document.createElement('div');
  overlay.id = 'nudge-overlay';
  overlay.innerHTML = `
    <div class="nudge-card glass sheet sheet-corners">
      <h2 class="nudge-title">${esc(t('nudge.title'))}</h2>
      <p class="nudge-body">${esc(t('nudge.body'))}</p>
      <ul class="nudge-list">
        ${['f1', 'f2', 'f3', 'f4', 'f5'].map((k) => `<li><span class="nudge-check">✓</span>${esc(t(`nudge.${k}`))}</li>`).join('')}
      </ul>
      <div class="nudge-actions">
        <button class="btn btn-ghost" id="nudge-continue">${esc(t('nudge.continue'))}</button>
        <button class="btn btn-primary" id="nudge-upgrade">${esc(t('nudge.upgrade'))}&nbsp;&nbsp;→</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#nudge-continue').addEventListener('click', close);
  overlay.querySelector('#nudge-upgrade').addEventListener('click', () => {
    close();
    onUpgrade?.();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  window.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); window.removeEventListener('keydown', onEsc); }
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Versionsverlauf als Zeitstrahl. Jede Version ist ein Block mit Datum und
// farbig getaggten Änderungen (Neu / Verbessert / Behoben). Wird die App nach
// einem Update zum ersten Mal gestartet, öffnet sich das Fenster von selbst und
// hebt die neue Version hervor ("Was ist neu"). Sonst über das Über-Fenster
// erreichbar.
import { t, currentLang } from './i18n.js';
import { CHANGELOG, CHANGE_TYPES, entryText } from './changelog.js';
import { esc } from './modalUtils.js';

const SEEN_KEY = 'cubory-seen-version';

let overlay = null;

/** Gibt es eine ungesehene Version? (nach einem Update) */
export function hasUnseenVersion(installedVersion) {
  const seen = localStorage.getItem(SEEN_KEY);
  return !!installedVersion && seen !== installedVersion;
}

/** Merkt die Version als gesehen - dann öffnet sich "Was ist neu" nicht erneut. */
export function markVersionSeen(installedVersion) {
  if (installedVersion) localStorage.setItem(SEEN_KEY, installedVersion);
}

/**
 * @param opts {
 *   installedVersion?: string,   // aktuell laufende Version -> "Aktuell"-Marke
 *   highlight?: string,          // Version, die als "Neu" hervorgehoben wird
 *   whatsNew?: boolean,          // Titel "Was ist neu" statt "Versionsverlauf"
 *   onClose?: () => void,
 * }
 */
export function openChangelog(opts = {}) {
  if (overlay) return;
  const { installedVersion, highlight, whatsNew, onClose } = opts;
  const lang = currentLang();

  overlay = document.createElement('div');
  overlay.id = 'changelog-modal';

  const versions = CHANGELOG.map((v) => versionBlock(v, lang, installedVersion, highlight)).join('');

  overlay.innerHTML = `<div class="cl-card glass sheet sheet-corners">
    <div class="cl-head">
      <div>
        <h2 class="cl-title">${esc(t(whatsNew ? 'changelog.whatsNew' : 'changelog.title'))}</h2>
        <p class="cl-sub">${esc(whatsNew ? t('changelog.whatsNewSub', { v: highlight || installedVersion || '' }) : t('changelog.subtitle'))}</p>
      </div>
      <button class="cl-x" id="cl-close" title="${esc(t('about.close'))}">✕</button>
    </div>
    <div class="cl-body">${versions}</div>
  </div>`;

  document.body.appendChild(overlay);
  window.addEventListener('keydown', onEsc);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(onClose); });
  overlay.querySelector('#cl-close').addEventListener('click', () => close(onClose));
}

function versionBlock(v, lang, installedVersion, highlight) {
  const isCurrent = v.version === installedVersion;
  const isNew = v.version === highlight;
  const badge = isNew
    ? `<span class="cl-badge cl-badge-new">${esc(t('changelog.new'))}</span>`
    : isCurrent
      ? `<span class="cl-badge cl-badge-current">${esc(t('changelog.current'))}</span>`
      : '';

  // Änderungen in fester Reihenfolge der Arten gruppieren, damit "Neu" oben steht.
  const byType = CHANGE_TYPES.flatMap((type) =>
    v.entries.filter((e) => e.type === type).map((e) => entryRow(type, entryText(e, lang))));

  return `<section class="cl-version${isNew ? ' is-new' : ''}">
    <div class="cl-rail"><span class="cl-dot${isCurrent || isNew ? ' on' : ''}"></span></div>
    <div class="cl-block">
      <div class="cl-vhead">
        <span class="cl-vnum mono">${esc(v.version)}</span>
        <span class="cl-vdate">${esc(formatDate(v.date, lang))}</span>
        ${badge}
      </div>
      <div class="cl-entries">${byType.join('')}</div>
    </div>
  </section>`;
}

function entryRow(type, text) {
  return `<div class="cl-entry">
    <span class="cl-tag cl-tag-${type}">${esc(t('changelog.' + type))}</span>
    <span class="cl-text">${esc(text)}</span>
  </div>`;
}

function formatDate(iso, lang) {
  const [y, m, d] = iso.split('-').map(Number);
  try {
    return new Date(y, m - 1, d).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function onEsc(e) { if (e.key === 'Escape') close(); }

function close(onClose) {
  overlay?.remove();
  overlay = null;
  window.removeEventListener('keydown', onEsc);
  onClose?.();
}

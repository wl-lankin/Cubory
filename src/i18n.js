import en from './strings/en.js';
import de from './strings/de.js';
import fr from './strings/fr.js';
import es from './strings/es.js';
import it from './strings/it.js';
import pt from './strings/pt.js';
import nl from './strings/nl.js';
import pl from './strings/pl.js';
import sv from './strings/sv.js';
import da from './strings/da.js';
import no from './strings/no.js';
import fi from './strings/fi.js';
import cs from './strings/cs.js';
import sk from './strings/sk.js';
import hu from './strings/hu.js';
import ro from './strings/ro.js';
import el from './strings/el.js';
import bg from './strings/bg.js';
import hr from './strings/hr.js';
import uk from './strings/uk.js';

const DICTS = { en, de, fr, es, it, pt, nl, pl, sv, da, no, fi, cs, sk, hu, ro, el, bg, hr, uk };

// Native Namen für den Sprachumschalter
export const LOCALES = [
  ['en', 'English'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['es', 'Español'],
  ['it', 'Italiano'],
  ['pt', 'Português'],
  ['nl', 'Nederlands'],
  ['pl', 'Polski'],
  ['sv', 'Svenska'],
  ['da', 'Dansk'],
  ['no', 'Norsk'],
  ['fi', 'Suomi'],
  ['cs', 'Čeština'],
  ['sk', 'Slovenčina'],
  ['hu', 'Magyar'],
  ['ro', 'Română'],
  ['el', 'Ελληνικά'],
  ['bg', 'Български'],
  ['hr', 'Hrvatski'],
  ['uk', 'Українська'],
];

const STORAGE_KEY = 'cubory-lang';

function systemLang() {
  const code = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return code in DICTS ? code : 'en';
}

/** Gespeicherte Wahl: Sprachcode oder 'system' (Standard) */
export function storedLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'system';
  } catch {
    return 'system';
  }
}

/** Effektiv aktive Sprache */
export function currentLang() {
  const stored = storedLang();
  return stored === 'system' ? systemLang() : (stored in DICTS ? stored : 'en');
}

export function setLang(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* not persisted */ }
}

/** Übersetzung mit {platzhalter}-Ersetzung; fällt auf Englisch zurück */
export function t(key, vars) {
  const lang = currentLang();
  let s = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

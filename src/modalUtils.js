// Gemeinsame Helfer für die Speichern-Modals (HD-Shot, Export): Escaping,
// Breadcrumb-Pfade, Dateiname-Vorschlag. Bewusst ohne Zustand, damit beide
// Modals sie teilen können.

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Letzte Ebenen eines Pfads als klickbare Breadcrumbs. */
export function crumbs(p) {
  const parts = p.split(/[/\\]/).filter(Boolean);
  const sep = p.startsWith('/') ? '/' : '';
  const out = [];
  let acc = sep;
  if (sep) out.push({ name: '/', path: '/' });
  for (const part of parts) {
    acc = acc + (acc.endsWith('/') || acc === '' ? '' : '/') + part;
    out.push({ name: part, path: acc });
  }
  return out.slice(-4); // nur die letzten Ebenen, sonst wird es zu breit
}

/** Verkürzter Pfad für die Statuszeile (nur die letzten zwei Ebenen). */
export function shortPath(p) {
  if (!p) return '';
  const parts = p.split(/[/\\]/).filter(Boolean);
  return (p.startsWith('/') ? '/' : '') + parts.slice(-2).join('/');
}

/** Aus dem Modellnamen einen dateisystemfreundlichen Basisnamen machen. */
export function slug(s) {
  return String(s || 'cubory')
    .replace(/\.[^.]+$/, '')            // Dateiendung des Modells weg
    .replace(/[^\p{L}\p{N}]+/gu, '-')   // alles Nicht-Alphanumerische zu -
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cubory';
}

/** Zeitstempel JJJJMMTT-hhmm für eindeutige Dateinamen. */
export function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

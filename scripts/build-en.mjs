// Erzeugt website/en/index.html aus der deutschen Startseite.
//
// Warum überhaupt: translate.js übersetzt die Seite im Browser, aber unter
// derselben Adresse. Suchmaschinen können so nur eine Sprache in den Index
// nehmen - die englische Fassung war praktisch unsichtbar. Eine eigene URL
// lässt sich indexieren und über hreflang mit der deutschen verknüpfen.
//
// Aufruf:  node scripts/build-en.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'website');

const TITEL = 'Cubory - CAD Viewer for DXF, DWG, STEP, STL | Mac & Windows';
const BESCHREIBUNG = 'Open CAD files without detours: DXF, DWG, STEP, IGES, STL, OBJ, 3MF and more '
  + '- on Mac, Windows and Linux, fully offline. Free, with no time limit.';

/** Holt das Wörterbuch aus translate.js. Bewusst aus derselben Datei, die auch
 *  der Browser lädt: zwei Wörterbücher würden über kurz oder lang auseinander
 *  laufen. */
function woerterbuch() {
  const quelle = readFileSync(join(site, 'translate.js'), 'utf8');
  const anfang = quelle.indexOf('const D = {');
  const ende = quelle.indexOf('\n  };', anfang);
  if (anfang < 0 || ende < 0) throw new Error('Wörterbuch in translate.js nicht gefunden');
  const literal = quelle.slice(anfang + 'const D = '.length, ende + '\n  }'.length);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${literal})`)();
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

const D = woerterbuch();
const lookup = {};
for (const [k, v] of Object.entries(D)) lookup[norm(k)] = v;

const html = readFileSync(join(site, 'index.html'), 'utf8');
const fenster = new Window();
const dok = fenster.document;
dok.write(html);

// Textknoten übersetzen - gleiche Regel wie im Browser
const lauf = dok.createTreeWalker(dok.body, 4 /* SHOW_TEXT */);
const knoten = [];
while (lauf.nextNode()) knoten.push(lauf.currentNode);
let ersetzt = 0;
let offen = [];
for (const n of knoten) {
  const roh = norm(n.textContent);
  if (!roh) continue;
  const t = lookup[roh];
  if (t !== undefined) {
    n.textContent = n.textContent.replace(n.textContent.trim(), t);
    ersetzt++;
  } else if (roh.length > 3 && /[äöüß]|\b(und|oder|nicht|ohne|wird|beim|Datei)\b/i.test(roh)) {
    offen.push(roh.slice(0, 60));
  }
}
dok.querySelectorAll('svg text').forEach((n) => {
  const t = lookup[norm(n.textContent)];
  if (t !== undefined) { n.textContent = t; ersetzt++; }
});

dok.documentElement.setAttribute('lang', 'en');

let ausgabe = '<!doctype html>\n' + dok.documentElement.outerHTML;

// Relative Pfade zeigen von /en/ ins Leere
ausgabe = ausgabe
  .replace(/(src|href)="assets\//g, '$1="/assets/')
  .replace(/src="main\.js"/g, 'src="/main.js"')
  // Die Seite ist bereits übersetzt; translate.js würde nur erneut darüberlaufen
  .replace(/\s*<script src="\/translate\.js"><\/script>/g, '')
  // Ratgeber-Links auf die englischen Fassungen umbiegen
  .replace(/href="\/dxf-datei-oeffnen\.html"/g, 'href="/en/open-dxf-file.html"')
  .replace(/href="\/step-datei-oeffnen\.html"/g, 'href="/en/open-step-file.html"')
  // Der Sprachlink zeigt von der englischen Seite zurück auf die deutsche
  .replace(/<a href="\/en\/" hreflang="en">English<\/a>/g, '<a href="/" hreflang="de">Deutsch</a>');

// Kopfbereich auf Englisch
ausgabe = ausgabe
  .replace(/<title>[^<]*<\/title>/, `<title>${TITEL}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${BESCHREIBUNG}$2`)
  .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1Cubory - CAD Viewer for DXF, DWG, STEP and STL$2')
  .replace(/(<meta property="og:description" content=")[^"]*(")/,
    '$1Open DXF, DWG, STEP, IGES, STL, OBJ & 3MF - on Mac, Windows and Linux, fully offline. Free forever.$2')
  .replace(/(<meta property="og:url" content=")[^"]*(")/, '$1https://cubory.app/en/$2')
  .replace(/(<meta property="og:locale" content=")[^"]*(")/, '$1en$2')
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, '$1Cubory - CAD Viewer for DXF, DWG, STEP and STL$2')
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/,
    '$1Open CAD files without detours - on Mac, Windows and Linux, fully offline. Free, with no time limit.$2')
  .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, '<link rel="canonical" href="https://cubory.app/en/" />');

// Strukturierte Daten auf die englische Fassung zeigen lassen
ausgabe = ausgabe
  .replace(/"inLanguage": "de"/g, '"inLanguage": "en"')
  .replace(/"url": "https:\/\/cubory\.app\/"/g, '"url": "https://cubory.app/en/"');

mkdirSync(join(site, 'en'), { recursive: true });
writeFileSync(join(site, 'en', 'index.html'), ausgabe);

console.log(`en/index.html erzeugt - ${ersetzt} Stellen übersetzt`);
if (offen.length) {
  console.log(`WARNUNG: ${offen.length} Stellen ohne Übersetzung:`);
  offen.slice(0, 10).forEach((t) => console.log('   ', t));
  process.exitCode = 1;
}

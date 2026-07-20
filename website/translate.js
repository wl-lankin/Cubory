// Zwei Aufgaben:
//
// 1. Das Wörterbuch Deutsch -> Englisch. Es wird nicht mehr im Browser
//    angewendet, sondern von scripts/build-en.mjs gelesen, das daraus
//    website/en/index.html erzeugt. Beide Sprachen haben damit eine eigene
//    Adresse, die Suchmaschinen getrennt in den Index nehmen können.
//    Vorher wurde diese Seite im Browser übersetzt - Googlebot surft mit
//    en-US und hätte unter der deutschen Adresse englischen Inhalt gesehen,
//    in direkter Konkurrenz zu /en/.
//
// 2. Ein dezenter Hinweis für Besucher mit nicht-deutschem Browser, dass es
//    die Seite auf Englisch gibt. Bewusst kein automatischer Wechsel: der
//    würde Suchmaschinen daran hindern, die deutsche Fassung zu erfassen.
(function () {
  const params = new URLSearchParams(location.search);
  const lang = (params.get('lang') || navigator.language || 'de').slice(0, 2).toLowerCase();
  window.__t = (s) => s;
  if (lang === 'de' || location.pathname.startsWith('/en')) return;
  if (localStorage.getItem('cubory-lang-hinweis') === 'weg') return;

  addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.className = 'langbar';
    bar.innerHTML = '<span>This page is also available in English.</span>'
      + '<a href="/en/" hreflang="en">Read in English &rarr;</a>'
      + '<button type="button" aria-label="Dismiss">&times;</button>';
    bar.querySelector('button').addEventListener('click', () => {
      localStorage.setItem('cubory-lang-hinweis', 'weg');
      bar.remove();
    });
    document.body.prepend(bar);
  });
  return;

  const D = {
    'POS 8 · RÜCKFRAGEN': 'POS 8 · QUESTIONS',
    'Häufig': 'Frequently', 'gefragt': 'asked',
    'Brauche ich AutoCAD, um eine DWG oder DXF zu öffnen?': 'Do I need AutoCAD to open a DWG or DXF?',
    'Nein. Cubory zeigt DWG- und DXF-Zeichnungen direkt an, mit allen Ebenen und ihren Original-Farben. Für DWG wird zusätzlich LibreDWG auf dem System benötigt, für DXF nichts weiter.':
      'No. Cubory displays DWG and DXF drawings directly, with all layers and their original colors. DWG additionally requires LibreDWG on your system, DXF needs nothing else.',
    'Welche Dateiformate kann Cubory öffnen?': 'Which file formats can Cubory open?',
    '2D: DXF und DWG. 3D: STEP, STP, IGES, IGS, BREP, STL, OBJ, 3MF, PLY sowie GLTF und GLB. STEP, IGES und BREP laufen über OpenCascade, denselben Kern, den auch professionelle CAD-Programme verwenden.':
      '2D: DXF and DWG. 3D: STEP, STP, IGES, IGS, BREP, STL, OBJ, 3MF, PLY as well as GLTF and GLB. STEP, IGES and BREP run on OpenCascade, the same core professional CAD software uses.',
    'Ist Cubory kostenlos?': 'Is Cubory free?',
    'Funktioniert Cubory ohne Internetverbindung?': 'Does Cubory work without an internet connection?',
    'Läuft Cubory auf Mac, Windows und Linux?': 'Does Cubory run on Mac, Windows and Linux?',
    'Was unterscheidet Free von Pro?': 'What is the difference between Free and Pro?',
    'Free zeigt alle Dateien unbegrenzt an. Pro ergänzt Messen mit Einrasten auf Ecken und Kanten, Schnittansichten entlang X, Y und Z, Explosionsansichten für Baugruppen sowie Export nach STL und SVG. Jedes neue Konto bekommt Pro 7 Tage kostenlos.':
      'Free displays all files without limits. Pro adds measuring with snapping to corners and edges, section views along X, Y and Z, exploded views for assemblies and export to STL and SVG. Every new account gets Pro free for 7 days.',
    'Der Viewer ja, dauerhaft und ohne Zeitlimit: alle Formate, Ansichten, Ebenen und Teilelisten. Messen, Schnittansichten, Explosionsansichten und Export gehören zu Pro und kosten 79 € im Jahr oder 199 € einmalig.':
      'The viewer yes, permanently and with no time limit: all formats, views, layers and parts lists. Measuring, section views, exploded views and export belong to Pro and cost 79 € per year or 199 € once.',
    'Dateien werden ausschließlich auf dem eigenen Rechner geladen und dargestellt, nichts wird hochgeladen. Die kostenlosen Funktionen brauchen gar keine Verbindung. Eine Pro-Lizenz meldet sich etwa täglich beim Server; bleibt der Rechner offline, läuft Pro noch 30 Tage weiter.':
      'Files are loaded and rendered exclusively on your own machine, nothing is uploaded. The free features need no connection at all. A Pro license checks in with the server about once a day; if the machine stays offline, Pro keeps working for another 30 days.',
    'Ja: macOS für Apple Silicon und Intel, Windows 64-bit und Linux als AppImage. Die Installer sind noch nicht signiert, deshalb zeigen Gatekeeper und SmartScreen beim ersten Start eine Warnung, die sich bestätigen lässt.':
      'Yes: macOS for Apple Silicon and Intel, Windows 64-bit and Linux as an AppImage. The installers are not code-signed yet, so Gatekeeper and SmartScreen show a warning on first launch that you can confirm.',
    'FAQ': 'FAQ',
    '· Free-Funktionen ohne Konto': '· Free features without an account',
    'Features': 'Features', 'Preise': 'Pricing', 'Download': 'Download',
    'Jedes Modell': 'Every model', 'Sofort im Blick': 'Instantly in view',
    'Cubory öffnet Zeichnungen und 3D-Modelle ohne Umwege - auf Mac, Windows und Linux, komplett offline. Free für immer. Pro, wenn du mehr willst.':
      'Cubory opens drawings and 3D models right away - on Mac, Windows and Linux, fully offline. Free forever. Pro when you need more.',
    'Kostenlos laden': 'Download free', 'Kostenlos laden →': 'Download free →', 'Pro entdecken': 'Discover Pro',
    '7 Tage Pro gratis bei jedem neuen Konto · keine Kreditkarte nötig': '7 days of Pro free with every new account · no credit card required',
    'BLATT 0 · ENTWURF': 'SHEET 0 · DRAFT',
    'POS 5 · EXPLOSION · SCROLLEN': 'POS 5 · EXPLODED VIEW · SCROLL',
    'POS 1-7 · WERKZEUGE': 'POS 1-7 · TOOLS',
    'Ein Viewer wie eine': 'A viewer like an', 'Baugruppenzeichnung': 'assembly drawing',
    'Jede Funktion hat ihre Position - wie auf dem Zeichnungsblatt.\n  Fahre über die Stückliste.': 'Every feature has its position - just like on the drawing sheet. Hover over the parts list.',
    'BLATT 1/1': 'SHEET 1/1',
    'Pos.': 'Pos.', 'Bezeichnung': 'Description', 'Lizenz': 'License',
    'Alle gängigen Formate': 'All common formats',
    'DXF, DWG, STEP, STP, IGES, BREP, STL, OBJ, 3MF, PLY, GLTF, GLB - echter OpenCascade-Kern': 'DXF, DWG, STEP, STP, IGES, BREP, STL, OBJ, 3MF, PLY, GLTF, GLB - a real OpenCascade core',
    'Baugruppen & Ebenen': 'Assemblies & layers',
    'Teilenamen, Isolation, Originalfarben': 'Part names, isolation, original colors',
    'Messen mit Snapping': 'Measure with snapping',
    'mm-genau, rastet auf Ecken und Kanten': 'mm-precise, snaps to corners and edges',
    'Schnittansichten': 'Section views',
    'Clipping entlang X/Y/Z, stufenlos': 'Clipping along X/Y/Z, continuous',
    'Explosionsansichten': 'Exploded views',
    'Baugruppen stufenlos auseinanderziehen': 'Pull assemblies apart continuously',
    'Export & HD-Shots': 'Export & HD shots',
    'STL, maßhaltiges SVG, HD-Screenshots': 'STL, true-to-scale SVG, HD screenshots',
    '20 Sprachen · offline': '20 languages · offline',
    'komplett lokal, Pro bis 30 Tage offline': 'fully local, Pro works up to 30 days offline',
    'Maßstab': 'Scale', 'Blatt': 'Sheet', 'Gezeichnet': 'Drawn', 'Geprüft': 'Checked',
    'bestanden': 'passed', 'Werkstoff': 'Material',
    'The modern CAD viewer': 'The modern CAD viewer',
    'TABELLE A · KONDITIONEN': 'TABLE A · TERMS',
    'Preise wie im': 'Pricing like a', 'Datenblatt': 'datasheet',
    'Free bleibt für immer voll benutzbar. Pro schaltet die Positionen 3-6 frei.': 'Free stays fully usable forever. Pro unlocks positions 3-6.',
    'Preis': 'Price', 'Preis (netto)': 'Price (net)', 'Abrechnung': 'Billing', 'Geräte': 'Devices', 'Testphase': 'Trial',
    'Pro Jährlich': 'Pro Yearly', 'Pro Monatlich': 'Pro Monthly', 'Empfohlen': 'Recommended',
    'pro Jahr': 'per year', 'pro Jahr · 2 Monate geschenkt': 'per year · 2 months free', 'Monatlich': 'Monthly', 'Jährlich': 'Yearly', 'pro Monat': 'per month', 'einmalig': 'one-time',
    '7 Tage gratis': '7 days free', 'Laden': 'Download', 'Testen': 'Try', 'Kaufen': 'Buy',
    'AUSGABE · PLOT': 'OUTPUT · PLOT',
    'Cubory': 'Cubory', 'laden': 'download',
    'Version': 'Version', 'bald verfügbar': 'coming soon',
    'macOS · Apple Silicon · 107 MB': 'macOS · Apple Silicon · 107 MB',
    'macOS · Intel · 111 MB': 'macOS · Intel · 111 MB',
    'Windows · 64-bit · 86 MB': 'Windows · 64-bit · 86 MB',
    'Linux · x64 · 116 MB': 'Linux · x64 · 116 MB',
    '© 2026 Cubory · The modern CAD viewer': '© 2026 Cubory · The modern CAD viewer',
    'Entwickelt von': 'Built by', 'Impressum': 'Legal notice', 'Datenschutz': 'Privacy', 'AGB': 'Terms', 'Widerruf & Erstattung': 'Refund policy',
    // Error-Pages
    'FEHLER · BLATT NICHT IM ZEICHNUNGSSATZ': 'ERROR · SHEET NOT IN DRAWING SET',
    'Dieses Blatt existiert nicht': 'This sheet does not exist',
    'Die angeforderte Seite wurde im Zeichnungssatz nicht gefunden -\n  vielleicht wurde sie nie gezeichnet, vielleicht ist sie explodiert.': 'The requested page was not found in the drawing set - maybe it was never drawn, maybe it exploded.',
    'Zurück zur Übersicht': 'Back to overview', 'Zurück zur Übersicht →': 'Back to overview →',
    'TIPP: BEWEGE DIE MAUS DURCH DIE ZAHL': 'TIP: MOVE YOUR MOUSE THROUGH THE NUMBER',
    'FEHLER · PLOT FEHLGESCHLAGEN': 'ERROR · PLOT FAILED',
    'Der Plot ist schiefgelaufen': 'The plot went wrong',
    'Auf dem Server ist etwas schiefgelaufen. Wir zeichnen das Blatt gerade neu - bitte versuche es gleich noch einmal.': 'Something went wrong on the server. We are redrawing the sheet - please try again in a moment.',
  };

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const lookup = {};
  for (const [k, v] of Object.entries(D)) lookup[norm(k)] = v;

  window.__t = (s) => lookup[norm(s)] || s;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const t = lookup[norm(n.textContent)];
    if (t !== undefined) {
      // führende/folgende Leerzeichen des Originals erhalten
      n.textContent = n.textContent.replace(norm(n.textContent) === '' ? '' : n.textContent.trim(), t);
    }
  }
  // SVG-Texte und Attribute
  document.querySelectorAll('svg text').forEach((n) => {
    const t = lookup[norm(n.textContent)];
    if (t !== undefined) n.textContent = t;
  });
})();

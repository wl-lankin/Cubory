// Website-Lokalisierung ohne Umschalter: Deutsch ist die Quelle im Markup,
// alle anderen Browsersprachen bekommen Englisch. Ersetzt exakte Textknoten
// über ein Wörterbuch - kein Retagging der Seite nötig.
// Test-Override: ?lang=en
(function () {
  const params = new URLSearchParams(location.search);
  const lang = (params.get('lang') || navigator.language || 'de').slice(0, 2).toLowerCase();
  window.__t = (s) => s;
  if (lang === 'de') return;
  document.documentElement.lang = 'en';

  const D = {
    'Features': 'Features', 'Preise': 'Pricing', 'Download': 'Download',
    'Jedes Modell': 'Every model', 'Sofort im Blick': 'Instantly in view',
    'Cubory öffnet Zeichnungen und 3D-Modelle ohne Umwege - auf Mac, Windows und Linux, komplett offline. Free für immer. Pro, wenn du mehr willst.':
      'Cubory opens drawings and 3D models right away - on Mac, Windows and Linux, fully offline. Free forever. Pro when you need more.',
    'Kostenlos laden': 'Download free', 'Kostenlos laden →': 'Download free →', 'Pro entdecken': 'Discover Pro',
    '7 Tage Pro gratis bei jedem neuen Konto · keine Kreditkarte nötig': '7 days of Pro free with every new account · no credit card required',
    'CUBORY · BLATT 0 · ENTWURF': 'CUBORY · SHEET 0 · DRAFT',
    'POS 5 · EXPLOSION · SCROLLEN': 'POS 5 · EXPLODED VIEW · SCROLL',
    'POS 1-7 · WERKZEUGE': 'POS 1-7 · TOOLS',
    'Ein Viewer wie eine': 'A viewer like an', 'Baugruppenzeichnung': 'assembly drawing',
    'Jede Funktion hat ihre Position - wie auf dem Zeichnungsblatt.\n  Fahre über die Stückliste.': 'Every feature has its position - just like on the drawing sheet. Hover over the parts list.',
    'CUBORY · BLATT 1/1': 'CUBORY · SHEET 1/1',
    'Pos.': 'Pos.', 'Bezeichnung': 'Description', 'Lizenz': 'License',
    'Alle Formate': 'All formats',
    'DXF, STEP, STP, IGES, BREP, STL, OBJ - echter OpenCascade-Kern': 'DXF, STEP, STP, IGES, BREP, STL, OBJ - a real OpenCascade core',
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
    'Version 1.0.0 · Free-Funktionen ohne Konto': 'Version 1.0.0 · Free features without an account',
    'macOS · Apple Silicon · 107 MB': 'macOS · Apple Silicon · 107 MB',
    'macOS · Intel · 111 MB': 'macOS · Intel · 111 MB',
    'Windows · 64-bit · 86 MB': 'Windows · 64-bit · 86 MB',
    'Linux · bald verfügbar': 'Linux · coming soon',
    '© 2026 Cubory · The modern CAD viewer': '© 2026 Cubory · The modern CAD viewer',
    'Entwickelt von': 'Built by',
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

// Versionsverlauf, den die App anzeigt. Pro Version eine Liste von Änderungen,
// nach Art gruppiert: 'new' (Neu), 'improved' (Verbessert), 'fixed' (Behoben).
// Der Text steht auf Deutsch und Englisch; jede andere Sprache fällt auf
// Englisch zurück. Neueste Version steht oben.
//
// Bei jedem Versionssprung hier oben eine Gruppe ergänzen: test/changelog.test.js
// besteht darauf, dass die Version aus package.json auch im Verlauf auftaucht -
// so kann keine Version ohne Änderungshinweise ausgeliefert werden.

export const CHANGELOG = [
  {
    version: '2.0.1',
    date: '2026-10-21',
    entries: [
      {
        type: 'improved',
        de: 'Zuverlässigere Auslieferung: Die Download-Dateien für Website und Updates werden jetzt eindeutig zugeordnet. An der App selbst ändert sich nichts.',
        en: 'More reliable delivery: the download files for the website and updates are now matched exactly. Nothing changes in the app itself.',
      },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-10-21',
    entries: [
      {
        type: 'new',
        de: 'Cubory ist jetzt komplett frei: Messen, Schnittansicht, Explosionsansicht, Export und HD-Screenshot stehen allen ohne Konto zur Verfügung. Anmeldung, Lizenzen und der Upgrade-Hinweis entfallen.',
        en: 'Cubory is now completely free: measuring, section view, exploded view, export and HD screenshots are available to everyone without an account. Sign-in, licences and the upgrade prompt are gone.',
      },
      {
        type: 'improved',
        de: 'Updates kommen jetzt über GitHub. Cubory sendet keine Daten mehr an einen eigenen Server, auch keine Absturzberichte.',
        en: 'Updates now come from GitHub. Cubory no longer sends any data to its own server, including crash reports.',
      },
      {
        type: 'fixed',
        de: 'Export: STL, OBJ, PLY und 3D-DXF behalten die Lage aus der CAD-Datei. Bisher lag das Teil im Slicer auf dem Rücken. Ausgeblendete Teile, Kantenlinien und eine geöffnete Explosionsansicht landen nicht mehr in der Datei.',
        en: 'Export: STL, OBJ, PLY and 3D DXF keep the orientation from the CAD file. Parts used to arrive in the slicer lying on their back. Hidden parts, edge lines and an open exploded view no longer end up in the file.',
      },
      {
        type: 'fixed',
        de: 'Viele Fehler beim Öffnen behoben: DWG per Doppelklick oder Drag & Drop, binäre STL mit „solid“-Kopf, Umlaute in älteren DXF, Einheiten in 3MF, fehlende Ordner im Datei-Browser. Raster, Drahtgitter und Kanten gelten jetzt pro Tab.',
        en: 'Many opening issues fixed: DWG by double click or drag and drop, binary STL with a "solid" header, accented characters in older DXF, units in 3MF, missing folders in the file browser. Grid, wireframe and edges now apply per tab.',
      },
    ],
  },
  {
    version: '1.7.3',
    date: '2026-09-08',
    entries: [
      {
        type: 'fixed',
        de: 'Explosionsansicht: Baugruppen, in denen dasselbe Teil mehrfach verbaut ist, ziehen jetzt richtig auseinander. Bisher rückten diese Teile gemeinsam in dieselbe Richtung, statt sich voneinander zu trennen.',
        en: 'Exploded view: assemblies that use the same part more than once now separate properly. Those parts used to move together in one direction instead of apart.',
      },
      {
        type: 'fixed',
        de: 'Das Raster liegt jetzt unter dem Modell. Bei Baugruppen, die in ihrer Datei weit vom Nullpunkt entfernt konstruiert sind, lag es bisher daneben.',
        en: 'The grid now sits underneath the model. For assemblies modelled far from the origin it used to sit beside them.',
      },
    ],
  },
  {
    version: '1.7.2',
    date: '2026-07-21',
    entries: [
      {
        type: 'improved',
        de: 'Der Update-Hinweis lässt sich wegklicken. Wer noch nicht aktualisieren möchte, blendet ihn aus - dieselbe Version meldet sich dann nicht bei jedem Start erneut.',
        en: 'The update notice can now be dismissed. If you would rather not update yet, hide it - the same version will not reappear on every launch.',
      },
    ],
  },
  {
    version: '1.7.1',
    date: '2026-07-21',
    entries: [
      {
        type: 'improved',
        de: 'Sanfterer Start: die Lizenz wird während der Startanimation geprüft, und der Kristall zündet erst, wenn sie steht. Ein Pro-Konto ist damit direkt angemeldet, sobald die Animation durch ist - ohne kurz aufblitzenden Hinweis.',
        en: 'Smoother start: your licence is checked during the start animation, and the crystal only ignites once it is ready. A Pro account is signed in the moment the animation finishes - with no prompt flashing by.',
      },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-07-21',
    entries: [
      {
        type: 'new',
        de: 'Versionsverlauf in der App: auf einen Blick sehen, was sich geändert hat. Nach jedem Update zeigt "Was ist neu" die Neuerungen - erreichbar auch über das Über-Fenster und die Optionen.',
        en: 'Version history in the app: see what has changed at a glance. After every update "What\'s new" shows the highlights - also reachable from the About window and the options.',
      },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-07-21',
    entries: [
      {
        type: 'new',
        de: 'Exportieren in viele Formate: DXF für 2D-Zeichnungen (laserfertige Linien) und 3D-Modelle (Flächen), dazu STL, OBJ, PLY, GLB, SVG und PNG - mit Vorschau und Ordnerwahl direkt im Fenster.',
        en: 'Export to many formats: DXF for 2D drawings (laser-ready lines) and 3D models (faces), plus STL, OBJ, PLY, GLB, SVG and PNG - with a preview and folder picker right in the window.',
      },
      {
        type: 'new',
        de: 'HD-Aufnahmen: die Ansicht in 2x, 3x oder 4x Auflösung aufnehmen, direkt speichern oder in die Zwischenablage kopieren.',
        en: 'HD snapshots: capture the view at 2x, 3x or 4x resolution, then save it or copy it straight to the clipboard.',
      },
      {
        type: 'improved',
        de: 'Schnittebene: die Position lässt sich jetzt in Millimeter direkt eingeben, der Regler zieht mit.',
        en: 'Section plane: the position can now be typed in millimetres, and the slider follows along.',
      },
      {
        type: 'improved',
        de: 'Die Lizenz wird schon während der Startanimation geprüft - Pro-Nutzer sehen keinen Hinweis mehr aufblitzen.',
        en: 'Your licence is now checked during the start animation, so Pro users never see a prompt flash by.',
      },
      {
        type: 'fixed',
        de: 'HD-Aufnahme in 4x lieferte manchmal ein leeres Bild.',
        en: 'HD snapshots at 4x sometimes produced a blank image.',
      },
      {
        type: 'fixed',
        de: 'Der Mess-Hinweis war hinter der Werkzeugleiste verdeckt.',
        en: 'The measurement hint was hidden behind the toolbar.',
      },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-07-19',
    entries: [
      {
        type: 'new',
        de: 'Cubory ist da: STEP, IGES, BREP, STL, OBJ, 3MF, PLY, GLTF/GLB, DXF und DWG betrachten - schnell, offline und ohne Cloud-Zwang.',
        en: 'Cubory is here: view STEP, IGES, BREP, STL, OBJ, 3MF, PLY, GLTF/GLB, DXF and DWG - fast, offline and with no cloud lock-in.',
      },
      {
        type: 'new',
        de: 'Werkzeuge zum Messen, für Schnittebenen und die Explosionsansicht von Baugruppen.',
        en: 'Tools for measuring, section planes and exploded views of assemblies.',
      },
      {
        type: 'new',
        de: 'Konten mit Pro-Lizenzen, Geräteverwaltung und automatischen Updates.',
        en: 'Accounts with Pro licences, device management and automatic updates.',
      },
      {
        type: 'improved',
        de: 'Saubere flache Schattierung mit erhaltenen Kanten, automatisch auf die Modellgröße abgestimmt.',
        en: 'Clean flat shading that keeps sharp edges, tuned automatically to the model size.',
      },
      {
        type: 'fixed',
        de: 'DXF-Farben auf dunklem Hintergrund - Blautöne wirkten vorher zu violett.',
        en: 'DXF colours on the dark background - blues previously looked too purple.',
      },
    ],
  },
];

/** Reihenfolge der Arten und ihre i18n-Schlüssel für die Beschriftung. */
export const CHANGE_TYPES = ['new', 'improved', 'fixed'];

/** Text einer Änderung in der gewünschten Sprache, mit Englisch als Rückfall. */
export function entryText(entry, lang) {
  return entry[lang] || entry.en;
}

/** Neueste Version im Verlauf (die oberste). */
export function latestVersion() {
  return CHANGELOG[0]?.version ?? null;
}

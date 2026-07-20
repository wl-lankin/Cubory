// Inhalt der Ratgeberseiten, je Sprache. Getrennt vom Erzeuger, damit sich
// Texte ändern lassen, ohne die Vorlage anzufassen.
//
// Zum Ton: Diese Seiten sollen jemandem helfen, der eine Datei nicht
// aufbekommt - nicht Cubory verkaufen. Deshalb stehen fremde Programme
// gleichberechtigt daneben und die bekannten Schwächen werden benannt. Wer
// hier eine Werbebroschüre findet, springt zurück, und genau das schadet der
// Platzierung mehr als jedes fehlende Stichwort.

export const guides = [
  {
    slug: { de: 'dxf-datei-oeffnen.html', en: 'open-dxf-file.html' },
    de: {
      titel: 'DXF-Datei öffnen: so geht es ohne AutoCAD',
      metaTitel: 'DXF-Datei öffnen - kostenlos, ohne AutoCAD | Cubory',
      beschreibung: 'DXF öffnen unter Windows, Mac und Linux: was im Format steckt, welche Programme es anzeigen '
        + 'und was zu tun ist, wenn die Zeichnung leer bleibt.',
      label: 'RATGEBER · DXF',
      einleitung: 'Eine DXF-Datei kommt meist von jemand anderem: vom Konstruktionsbüro, vom Laserdienstleister, '
        + 'aus einem Onlineshop für Bauteile. Und dann steht man davor und hat kein CAD-Programm. '
        + 'Dieser Text erklärt, was in so einer Datei steckt und wie man sie ansieht.',
      abschnitte: [
        {
          h: 'Was ist eine DXF-Datei?',
          p: [
            'DXF steht für <em>Drawing Interchange Format</em> und stammt von Autodesk, den Machern von AutoCAD. '
            + 'Gedacht ist es als Austauschformat: eine Zeichnung soll damit von einem CAD-Programm ins andere '
            + 'wandern, ohne dass beide dasselbe Dateiformat sprechen müssen.',
            'Der Inhalt ist fast immer eine zweidimensionale Zeichnung: Linien, Bögen, Kreise, Polylinien, '
            + 'Bemaßungen und Texte. Alles davon liegt auf Ebenen, und jede Ebene hat eine Farbe. Genau diese '
            + 'Ebenen sind der Grund, warum eine DXF mehr ist als ein Bild - man kann einzelne davon ausblenden, '
            + 'etwa um die Bemaßung wegzunehmen und nur die Kontur zu sehen.',
            'Die meisten DXF-Dateien sind reiner Text. Man kann sie in einem Editor öffnen und liest dann Zahlen '
            + 'in einer strengen Abfolge aus Gruppencode und Wert. Nützlich ist das selten, aber es erklärt, warum '
            + 'DXF-Dateien für ihren Inhalt oft erstaunlich groß sind.',
          ],
        },
        {
          h: 'Womit lässt sich eine DXF öffnen?',
          p: [
            'Man braucht kein AutoCAD. Diese Wege funktionieren:',
          ],
          liste: [
            '<b>Cubory</b> - der Viewer, um den es auf dieser Seite geht. Zeigt DXF mit Ebenen und Original-Farben, '
            + 'läuft auf Mac, Windows und Linux, kostet nichts und braucht kein Konto.',
            '<b>LibreCAD</b> oder <b>QCAD</b> - freie CAD-Programme. Können auch zeichnen und ändern, sind dafür '
            + 'schwergewichtiger und in der Bedienung gewöhnungsbedürftig.',
            '<b>Online-Viewer</b> - schnell, aber die Datei landet auf einem fremden Server. Bei Zeichnungen, die '
            + 'jemand anderem gehören, ist das oft keine gute Idee.',
            '<b>Autodesk-Programme</b> - AutoCAD selbst oder der kostenlose Viewer des Herstellers. Beides deutlich '
            + 'schwerer als nötig, wenn man nur hineinschauen will.',
          ],
        },
        {
          h: 'DXF mit Cubory ansehen',
          liste_nummeriert: [
            'Cubory laden und installieren - es gibt Installer für macOS, Windows und Linux.',
            'Die Datei per Doppelklick öffnen oder ins Fenster ziehen. Beim ersten Mal fragt das System '
            + 'möglicherweise, welches Programm zuständig ist.',
            'Links steht die Ebenenliste. Ein Klick auf den Punkt daneben blendet eine Ebene aus, etwa die Bemaßung.',
            'Mit dem Mausrad zoomen, mit gedrückter linker Taste verschieben. <em>Einpassen</em> holt die ganze '
            + 'Zeichnung zurück ins Bild, wenn man sich verirrt hat.',
          ],
        },
        {
          h: 'Wenn nichts zu sehen ist',
          p: [
            'Eine leer wirkende Zeichnung hat meist eine von vier Ursachen:',
          ],
          liste: [
            '<b>Alles ist da, nur weit weg.</b> Manche Programme legen Objekte in großem Abstand vom Nullpunkt ab. '
            + 'Einmal <em>Einpassen</em> drücken.',
            '<b>Die Ebene ist ausgeblendet.</b> In der Ebenenliste nachsehen, ob alle Punkte an sind.',
            '<b>Dunkle Farben auf dunklem Grund.</b> CAD-Zeichnungen sind für weißes Papier gemacht, reines Blau '
            + 'oder Schwarz verschwindet auf dunklem Hintergrund. Cubory hellt solche Farben automatisch auf und '
            + 'behält dabei den Farbton, damit Ebenen unterscheidbar bleiben.',
            '<b>Die Datei ist kaputt.</b> Kommt vor, wenn sie aus einer DWG konvertiert wurde. Am besten beim '
            + 'Absender eine frische Ausgabe erbitten.',
          ],
        },
        {
          h: 'DXF und DWG - was ist der Unterschied?',
          p: [
            'DWG ist das eigentliche Arbeitsformat von AutoCAD und nicht offengelegt. DXF ist die dokumentierte '
            + 'Austauschfassung davon. Praktisch heißt das: fast jedes Programm kann DXF lesen, DWG deutlich weniger.',
            'Cubory öffnet auch DWG. Dafür wird zusätzlich LibreDWG auf dem System gebraucht, ein freies Werkzeug, '
            + 'das die Datei nach DXF wandelt. Wer die Wahl hat, sollte sich die Zeichnung gleich als DXF geben lassen.',
          ],
        },
        {
          h: 'Was kostet das?',
          p: [
            'DXF ansehen kostet nichts, dauerhaft und ohne Konto. Alle Formate, Ebenen und Ansichten gehören zur '
            + 'kostenlosen Fassung. Geld kostet erst, wer in der Zeichnung messen, sie schneiden oder exportieren '
            + 'will - das sind 79 € im Jahr oder 199 € einmalig, jeweils netto.',
          ],
        },
      ],
      cta: 'Cubory laden',
      zurueck: 'Zur Startseite',
    },
    en: {
      titel: 'How to open a DXF file without AutoCAD',
      metaTitel: 'Open a DXF file - free, without AutoCAD | Cubory',
      beschreibung: 'Open DXF on Windows, Mac and Linux: what the format contains, which programs display it '
        + 'and what to do when the drawing looks empty.',
      label: 'GUIDE · DXF',
      einleitung: 'A DXF file usually comes from someone else: an engineering office, a laser cutting service, '
        + 'an online shop for parts. And there you are without any CAD software. This page explains what is '
        + 'inside such a file and how to look at it.',
      abschnitte: [
        {
          h: 'What is a DXF file?',
          p: [
            'DXF stands for <em>Drawing Interchange Format</em> and comes from Autodesk, the makers of AutoCAD. '
            + 'It is meant as an exchange format: a drawing should travel from one CAD program to another without '
            + 'both having to speak the same native format.',
            'The content is almost always a two-dimensional drawing: lines, arcs, circles, polylines, dimensions '
            + 'and text. All of it sits on layers, and every layer has a colour. Those layers are the reason a DXF '
            + 'is more than a picture - you can hide individual ones, for example to remove the dimensions and see '
            + 'only the outline.',
            'Most DXF files are plain text. You can open one in a text editor and will read numbers in a strict '
            + 'sequence of group code and value. That is rarely useful, but it explains why DXF files are often '
            + 'surprisingly large for what they contain.',
          ],
        },
        {
          h: 'Which programs open a DXF?',
          p: ['You do not need AutoCAD. These options work:'],
          liste: [
            '<b>Cubory</b> - the viewer this page belongs to. Shows DXF with layers and original colours, runs on '
            + 'Mac, Windows and Linux, costs nothing and needs no account.',
            '<b>LibreCAD</b> or <b>QCAD</b> - free CAD programs. They can also draw and edit, which makes them '
            + 'heavier and less obvious to operate.',
            '<b>Online viewers</b> - quick, but the file ends up on someone else’s server. For drawings that '
            + 'belong to a client, that is often a bad idea.',
            '<b>Autodesk software</b> - AutoCAD itself or the vendor’s free viewer. Both far heavier than '
            + 'necessary if you only want to look inside.',
          ],
        },
        {
          h: 'Viewing a DXF with Cubory',
          liste_nummeriert: [
            'Download and install Cubory - there are installers for macOS, Windows and Linux.',
            'Open the file by double-clicking it or drag it into the window. The first time, your system may ask '
            + 'which program is responsible.',
            'The layer list is on the left. Clicking the dot next to a layer hides it, for example the dimensions.',
            'Zoom with the scroll wheel, pan with the left mouse button held down. <em>Fit</em> brings the whole '
            + 'drawing back into view if you got lost.',
          ],
        },
        {
          h: 'When nothing shows up',
          p: ['A drawing that looks empty usually has one of four causes:'],
          liste: [
            '<b>Everything is there, just far away.</b> Some programs place objects a long way from the origin. '
            + 'Press <em>Fit</em> once.',
            '<b>The layer is hidden.</b> Check the layer list to see whether all dots are on.',
            '<b>Dark colours on a dark background.</b> CAD drawings are made for white paper; pure blue or black '
            + 'disappears on a dark background. Cubory brightens such colours automatically and keeps the hue so '
            + 'layers stay distinguishable.',
            '<b>The file is damaged.</b> This happens when it was converted from a DWG. Best to ask the sender for '
            + 'a fresh export.',
          ],
        },
        {
          h: 'DXF and DWG - what is the difference?',
          p: [
            'DWG is AutoCAD’s actual working format and is not publicly documented. DXF is the documented '
            + 'exchange version of it. In practice that means almost every program can read DXF, far fewer can read DWG.',
            'Cubory opens DWG too. That additionally requires LibreDWG on your system, a free tool that converts the '
            + 'file to DXF. If you have the choice, ask for the drawing as DXF right away.',
          ],
        },
        {
          h: 'What does it cost?',
          p: [
            'Viewing DXF costs nothing, permanently and without an account. All formats, layers and views belong to '
            + 'the free version. You only pay if you want to measure inside the drawing, section it or export it - '
            + 'that is 79 € per year or 199 € once, both net.',
          ],
        },
      ],
      cta: 'Download Cubory',
      zurueck: 'Back to the homepage',
    },
  },

  {
    slug: { de: 'step-datei-oeffnen.html', en: 'open-step-file.html' },
    de: {
      titel: 'STEP-Datei öffnen und ansehen',
      metaTitel: 'STEP-Datei öffnen (.step, .stp) - kostenlos ansehen | Cubory',
      beschreibung: 'STEP-Dateien öffnen auf Mac, Windows und Linux: was das Format kann, womit man es ansieht '
        + 'und warum Bauteile manchmal alle gleich heißen.',
      label: 'RATGEBER · STEP',
      einleitung: 'STEP ist das Format, in dem 3D-Modelle den Hersteller wechseln. Wer eines zugeschickt bekommt, '
        + 'will meist nur nachsehen, ob das Teil passt - und braucht dafür kein CAD-System für mehrere tausend Euro.',
      abschnitte: [
        {
          h: 'Was ist eine STEP-Datei?',
          p: [
            'STEP ist ein internationaler Standard, festgehalten in der Norm ISO 10303. Die Dateiendung ist '
            + '<code>.step</code> oder <code>.stp</code> - beides ist dasselbe.',
            'Anders als bei einem Netzformat wie STL steckt in einer STEP-Datei die echte Geometrie: Flächen, '
            + 'Zylinder, Radien, jeweils mathematisch beschrieben. Deshalb bleibt eine Bohrung eine Bohrung und wird '
            + 'nicht zu einem Vieleck aus Dreiecken. Man kann ein STEP-Modell in einem CAD-Programm weiterbearbeiten, '
            + 'bei einer STL geht das kaum.',
            'Eine STEP-Datei kann außerdem eine ganze Baugruppe enthalten, also mehrere Bauteile mit ihrer Lage '
            + 'zueinander. Beim Ansehen bekommt man dann eine Teileliste statt eines einzigen Klumpens.',
          ],
        },
        {
          h: 'Womit lässt sich eine STEP-Datei öffnen?',
          liste: [
            '<b>Cubory</b> - zeigt STEP über OpenCascade an, denselben Geometriekern, den auch kommerzielle '
            + 'CAD-Programme benutzen. Läuft offline, kostet zum Ansehen nichts.',
            '<b>FreeCAD</b> - freies CAD-System, kann STEP auch ändern. Mächtig, aber der Einstieg dauert.',
            '<b>Der Viewer des eigenen CAD-Herstellers</b> - etwa von SolidWorks oder Fusion. Meist kostenlos, '
            + 'aber an ein Konto gebunden.',
            '<b>Online-Viewer</b> - praktisch, wenn das Modell nicht vertraulich ist. Bei Kundenteilen sollte man '
            + 'zweimal überlegen, bevor man sie hochlädt.',
          ],
        },
        {
          h: 'STEP mit Cubory ansehen',
          liste_nummeriert: [
            'Cubory laden, installieren, die Datei hineinziehen.',
            'Beim ersten Öffnen wird die Geometrie vernetzt. Bei großen Baugruppen dauert das ein paar Sekunden - '
            + 'die Datei enthält Flächen, keine fertigen Dreiecke.',
            'Links erscheint die Teileliste. Ein Klick auf ein Teil hebt es hervor und blendet den Rest zurück, '
            + 'der Punkt daneben blendet es ganz aus.',
            'Über <em>Iso</em>, <em>Oben</em>, <em>Vorne</em> und <em>Rechts</em> kommt man zu den üblichen '
            + 'Ansichten, <em>Kanten</em> zeichnet die Umrisse nach.',
          ],
        },
        {
          h: 'Warum heißen alle Teile "Part 1"?',
          p: [
            'Das liegt an der Datei, nicht am Viewer. Viele CAD-Programme schreiben beim Export keine sprechenden '
            + 'Namen in die STEP-Datei, sondern für jedes Bauteil denselben Platzhalter. Cubory nummeriert solche '
            + 'Dubletten durch, damit sich die Teile wenigstens auseinanderhalten lassen.',
            'Wer die Namen braucht, sollte beim Absender nachfragen, ob er beim Export die Bauteilbezeichnungen '
            + 'mitgeben kann. In den meisten CAD-Systemen ist das eine Einstellung im Export-Dialog.',
          ],
        },
        {
          h: 'STEP oder STL - was nehmen?',
          p: [
            'Für die Fertigung, für Änderungen und für alles, was Maßhaltigkeit braucht: STEP. Die Geometrie ist '
            + 'exakt beschrieben.',
            'Für den 3D-Druck: STL oder 3MF. Der Drucker braucht ohnehin ein Netz aus Dreiecken, und diese Formate '
            + 'sind genau das. Umgekehrt lässt sich aus einer STL nur schwer wieder ein sauberes CAD-Modell machen.',
            'Cubory zeigt beides an, dazu IGES, BREP, OBJ, 3MF, PLY und GLTF.',
          ],
        },
        {
          h: 'Was kostet das?',
          p: [
            'Ansehen, drehen, Teile isolieren und Ebenen schalten: kostenlos, ohne Zeitlimit und ohne Konto. '
            + 'Messen, Schnittansichten, Explosionsansichten und Export gehören zu Pro und kosten 79 € im Jahr '
            + 'oder 199 € einmalig, jeweils netto.',
          ],
        },
      ],
      cta: 'Cubory laden',
      zurueck: 'Zur Startseite',
    },
    en: {
      titel: 'How to open and view a STEP file',
      metaTitel: 'Open a STEP file (.step, .stp) - view it for free | Cubory',
      beschreibung: 'Open STEP files on Mac, Windows and Linux: what the format can do, which programs display it '
        + 'and why parts are sometimes all named the same.',
      label: 'GUIDE · STEP',
      einleitung: 'STEP is the format in which 3D models change hands between companies. Whoever receives one '
        + 'usually just wants to check whether the part fits - and does not need a CAD system costing thousands.',
      abschnitte: [
        {
          h: 'What is a STEP file?',
          p: [
            'STEP is an international standard, written down as ISO 10303. The file extension is <code>.step</code> '
            + 'or <code>.stp</code> - both are the same thing.',
            'Unlike a mesh format such as STL, a STEP file holds the real geometry: surfaces, cylinders, radii, each '
            + 'described mathematically. That is why a hole stays a hole instead of becoming a polygon made of '
            + 'triangles. A STEP model can be edited further in a CAD program; an STL barely can.',
            'A STEP file can also contain a whole assembly, meaning several parts with their positions relative to '
            + 'each other. When viewing it you then get a parts list instead of a single lump.',
          ],
        },
        {
          h: 'Which programs open a STEP file?',
          liste: [
            '<b>Cubory</b> - displays STEP through OpenCascade, the same geometry core commercial CAD programs use. '
            + 'Runs offline, costs nothing to view.',
            '<b>FreeCAD</b> - free CAD system, can also edit STEP. Powerful, but takes a while to learn.',
            '<b>Your CAD vendor’s own viewer</b> - from SolidWorks or Fusion, for example. Usually free, but '
            + 'tied to an account.',
            '<b>Online viewers</b> - handy when the model is not confidential. For customer parts, think twice '
            + 'before uploading.',
          ],
        },
        {
          h: 'Viewing a STEP file with Cubory',
          liste_nummeriert: [
            'Download Cubory, install it, drag the file in.',
            'On first opening, the geometry is meshed. For large assemblies that takes a few seconds - the file '
            + 'contains surfaces, not ready-made triangles.',
            'The parts list appears on the left. Clicking a part highlights it and pushes the rest back; the dot '
            + 'next to it hides the part entirely.',
            'Use <em>Iso</em>, <em>Top</em>, <em>Front</em> and <em>Right</em> for the usual views, <em>Edges</em> '
            + 'traces the outlines.',
          ],
        },
        {
          h: 'Why are all parts called "Part 1"?',
          p: [
            'That comes from the file, not from the viewer. Many CAD programs do not write meaningful names into the '
            + 'STEP file on export but use the same placeholder for every part. Cubory numbers such duplicates so the '
            + 'parts can at least be told apart.',
            'If you need the names, ask the sender whether they can include part designations on export. In most CAD '
            + 'systems that is a setting in the export dialog.',
          ],
        },
        {
          h: 'STEP or STL - which one?',
          p: [
            'For manufacturing, for edits and for anything that needs dimensional accuracy: STEP. The geometry is '
            + 'described exactly.',
            'For 3D printing: STL or 3MF. The printer needs a triangle mesh anyway, and these formats are exactly '
            + 'that. The other way round, turning an STL back into a clean CAD model is hard.',
            'Cubory displays both, plus IGES, BREP, OBJ, 3MF, PLY and GLTF.',
          ],
        },
        {
          h: 'What does it cost?',
          p: [
            'Viewing, rotating, isolating parts and toggling layers: free, with no time limit and no account. '
            + 'Measuring, section views, exploded views and export belong to Pro and cost 79 € per year or 199 € '
            + 'once, both net.',
          ],
        },
      ],
      cta: 'Download Cubory',
      zurueck: 'Back to the homepage',
    },
  },
];

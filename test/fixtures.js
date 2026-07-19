// Testdateien werden hier im Code erzeugt statt als Binärdateien eingecheckt.
// So steht neben jedem Fixture, welchen Fehlerfall es abbildet - und das Repo
// bleibt frei von Blobs, deren Herkunft nach ein paar Monaten niemand mehr kennt.
import { zipSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';

const enc = new TextEncoder();
export const toBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
export const textBuffer = (s) => toBuffer(enc.encode(s));

/* ── DXF ─────────────────────────────────────────────────────────────────── */

/** Baut ein DXF aus Gruppencode/Wert-Paaren. */
function dxf(pairs) {
  return pairs.map(([code, value]) => `${code}\n${value}`).join('\n') + '\n';
}

function dxfLine(layer, x2, y2) {
  return [
    [0, 'LINE'], [8, layer],
    [10, 0], [20, 0], [30, 0],
    [11, x2], [21, y2], [31, 0],
  ];
}

/** DXF mit einer Ebene je Farbe. aciByLayer: { EBENE: ACI-Farbnummer } */
export function dxfWithLayers(aciByLayer) {
  const names = Object.keys(aciByLayer);
  return textBuffer(dxf([
    [0, 'SECTION'], [2, 'TABLES'], [0, 'TABLE'], [2, 'LAYER'],
    ...names.flatMap((n) => [[0, 'LAYER'], [2, n], [70, 0], [62, aciByLayer[n]], [6, 'CONTINUOUS']]),
    [0, 'ENDTAB'], [0, 'ENDSEC'],
    [0, 'SECTION'], [2, 'ENTITIES'],
    ...names.flatMap((n, i) => dxfLine(n, 100 + i * 10, 50)),
    [0, 'ENDSEC'], [0, 'EOF'],
  ]));
}

/** Regression: LibreDWG (dwg2dxf) schreibt lange Texte in Fortsetzungszeilen
 *  und lässt dabei den Gruppencode weg. Dadurch verschiebt sich die strenge
 *  Code/Wert-Abwechslung und der Parser verlor still die gesamte
 *  ENTITIES-Section - eine echte DWG kam mit 0 Elementen an. */
export function dxfWithBrokenGroupCode() {
  const good = dxf([
    [0, 'SECTION'], [2, 'ENTITIES'],
    [0, 'MTEXT'], [8, '0'], [10, 0], [20, 0], [30, 0],
    [1, 'Anfang des Textes'],
  ]);
  const broken = good + 'Fortsetzung ohne Gruppencode\n';
  const rest = dxf([
    ...dxfLine('0', 100, 50),
    [0, 'ENDSEC'], [0, 'EOF'],
  ]);
  return textBuffer(broken + rest);
}

/* ── PLY ─────────────────────────────────────────────────────────────────── */

const CUBE_V = [[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0],
                [0, 0, 40], [40, 0, 40], [40, 40, 40], [0, 40, 40]];
const CUBE_F = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1],
                [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];

export function plyMesh() {
  const head = `ply\nformat ascii 1.0\nelement vertex ${CUBE_V.length}\n`
    + 'property float x\nproperty float y\nproperty float z\n'
    + 'property uchar red\nproperty uchar green\nproperty uchar blue\n'
    + `element face ${CUBE_F.length}\nproperty list uchar int vertex_indices\nend_header\n`;
  const verts = CUBE_V.map((v, i) => `${v.join(' ')} ${(i * 30) % 256} 90 200`).join('\n');
  const faces = CUBE_F.map((f) => `3 ${f.join(' ')}`).join('\n');
  return textBuffer(head + verts + '\n' + faces + '\n');
}

/** PLY ohne Flächen - typisch für 3D-Scans. Als Mesh gezeichnet bliebe das
 *  Bild leer, deshalb muss daraus eine Punktwolke werden. */
export function plyPointCloud(count = 500) {
  const pts = Array.from({ length: count }, (_, i) => {
    const t = (i / count) * Math.PI * 12;
    return `${(20 * Math.cos(t)).toFixed(3)} ${(20 * Math.sin(t)).toFixed(3)} ${(i / count * 60).toFixed(3)}`;
  });
  return textBuffer(`ply\nformat ascii 1.0\nelement vertex ${count}\n`
    + 'property float x\nproperty float y\nproperty float z\nend_header\n'
    + pts.join('\n') + '\n');
}

/* ── STL / OBJ ───────────────────────────────────────────────────────────── */

export function stlAscii() {
  const tri = CUBE_F.map((f) => {
    const [a, b, c] = f.map((i) => CUBE_V[i]);
    // Echte Facettennormale: STLLoader übernimmt sie, und die Tests prüfen,
    // dass mitgelieferte Normalen erhalten bleiben.
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(...n) || 1;
    const nn = n.map((k) => (k / len).toFixed(6)).join(' ');
    const v = [a, b, c].map((p) => p.join(' '));
    return `facet normal ${nn}\n outer loop\n  vertex ${v[0]}\n  vertex ${v[1]}\n  vertex ${v[2]}\n endloop\nendfacet`;
  }).join('\n');
  return textBuffer(`solid cube\n${tri}\nendsolid cube\n`);
}

export function objCube() {
  const v = CUBE_V.map((p) => `v ${p.join(' ')}`).join('\n');
  const f = CUBE_F.map((t) => `f ${t.map((i) => i + 1).join(' ')}`).join('\n');
  return textBuffer(`# Testwürfel\n${v}\n${f}\n`);
}

/* ── GLTF / GLB ──────────────────────────────────────────────────────────── */

/** GLB mit zwei benannten Teilen - prüft, dass Baugruppen als Teileliste
 *  ankommen und damit für die Explosionsansicht ansprechbar sind. */
export function glbAssembly() {
  const verts = [...CUBE_V, ...CUBE_V.map(([x, y, z]) => [x + 60, y, z])];
  const idxA = CUBE_F.flat();
  const idxB = idxA.map((i) => i + 8);

  const pos = new Float32Array(verts.flat());
  const iA = new Uint16Array(idxA);
  const iB = new Uint16Array(idxB);
  const pad4 = (n) => (4 - (n % 4)) % 4;

  const offPos = 0;
  const offA = pos.byteLength + pad4(pos.byteLength);
  const offB = offA + iA.byteLength + pad4(iA.byteLength);
  const total = offB + iB.byteLength + pad4(iB.byteLength);

  const bin = new Uint8Array(total);
  bin.set(new Uint8Array(pos.buffer), offPos);
  bin.set(new Uint8Array(iA.buffer), offA);
  bin.set(new Uint8Array(iB.buffer), offB);

  const axis = (k) => verts.map((v) => v[k]);
  const json = {
    asset: { version: '2.0', generator: 'cubory-test' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0, name: 'Gehäuse' }, { mesh: 1, name: 'Deckel' }],
    meshes: [
      { name: 'Gehäuse', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] },
      { name: 'Deckel', primitives: [{ attributes: { POSITION: 0 }, indices: 2 }] },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: verts.length, type: 'VEC3',
        min: [0, 1, 2].map((k) => Math.min(...axis(k))),
        max: [0, 1, 2].map((k) => Math.max(...axis(k))) },
      { bufferView: 1, componentType: 5123, count: idxA.length, type: 'SCALAR' },
      { bufferView: 2, componentType: 5123, count: idxB.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offPos, byteLength: pos.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offA, byteLength: iA.byteLength, target: 34963 },
      { buffer: 0, byteOffset: offB, byteLength: iB.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: total }],
  };

  let js = enc.encode(JSON.stringify(json));
  if (pad4(js.length)) {
    const padded = new Uint8Array(js.length + pad4(js.length)).fill(0x20);
    padded.set(js);
    js = padded;
  }

  const out = new Uint8Array(12 + 8 + js.length + 8 + bin.length);
  const dv = new DataView(out.buffer);
  out.set(enc.encode('glTF'), 0);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, js.length, true);
  out.set(enc.encode('JSON'), 16);
  out.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true);
  out.set(enc.encode('BIN\0'), 24 + js.length);
  out.set(bin, 28 + js.length);
  return toBuffer(out);
}

/* ── 3MF ─────────────────────────────────────────────────────────────────── */

const MF_CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const MF_PROD = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06';

const mfMesh = () => `<mesh><vertices>`
  + CUBE_V.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('')
  + `</vertices><triangles>`
  + CUBE_F.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('')
  + `</triangles></mesh>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rel0" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

/** Klassische 3MF: die Geometrie steht direkt in der Wurzeldatei. */
export function threeMfClassic() {
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="${MF_CORE}">
<resources><object id="1" type="model">${mfMesh()}</object></resources>
<build><item objectid="1"/></build></model>`;
  return toBuffer(zipSync({
    '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(model),
  }, { level: 0 }));
}

/** Regression: 3MF Production Extension. Slicer (Bambu Studio, PrusaSlicer,
 *  Orca) legen die Geometrie in eigene 3D/Objects/*.model-Dateien und
 *  verweisen aus der Wurzeldatei darauf. three baut die Wurzeldatei zuerst,
 *  findet den Verweis dann noch nicht und bricht ab - vor prepare3mf()
 *  scheiterte damit jede aus einem Slicer exportierte Datei.
 *  Die Wurzeldatei steht hier bewusst als erster Eintrag im Archiv, genau wie
 *  bei echten Slicer-Exporten. */
export function threeMfProduction() {
  const root = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="${MF_CORE}" xmlns:p="${MF_PROD}" requiredextensions="p">
<resources><object id="2" type="model"><components>
<component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
</components></object></resources>
<build><item objectid="2"/></build></model>`;
  const external = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="${MF_CORE}" xmlns:p="${MF_PROD}">
<resources><object id="1" type="model">${mfMesh()}</object></resources>
<build/></model>`;
  return toBuffer(zipSync({
    '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(root),
    '3D/_rels/3dmodel.model.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`),
    '3D/Objects/object_1.model': strToU8(external),
  }, { level: 0 }));
}

/* ── STEP ────────────────────────────────────────────────────────────────── */

/** Minimaler STEP-Quader als MANIFOLD_SOLID_BREP: acht Ecken, zwölf Kanten,
 *  sechs ebene Flächen. Von Hand erzeugt statt eine echte Konstruktionsdatei
 *  einzuchecken - die wäre hunderte Kilobyte groß und gehörte jemandem.
 *  OpenCascade vernetzt daraus zwölf Dreiecke und liefert eigene Normalen mit,
 *  woran sich prüfen lässt, dass wir sie nicht überschreiben. */
export function stepBox(L = 40, W = 30, H = 20) {
  let n = 100;
  const out = [];
  const put = (s) => { n++; out.push(`#${n}=${s};`); return `#${n}`; };

  const P = [
    [0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0],
    [0, 0, H], [L, 0, H], [L, W, H], [0, W, H],
  ];
  const num = (v) => (Number.isInteger(v) ? `${v}.` : String(v));
  const pt = (p) => put(`CARTESIAN_POINT('',(${p.map(num).join(',')}))`);
  const dir = (d) => put(`DIRECTION('',(${d.map(num).join(',')}))`);

  const punkte = P.map(pt);
  const ecken = punkte.map((p) => put(`VERTEX_POINT('',${p})`));

  // Kante als EDGE_CURVE mit LINE dazwischen
  const kante = (a, b) => {
    const von = P[a], bis = P[b];
    const v = [bis[0] - von[0], bis[1] - von[1], bis[2] - von[2]];
    const len = Math.hypot(...v);
    const richtung = dir(v.map((k) => k / len));
    const basis = pt(von);
    const vektor = put(`VECTOR('',${richtung},${num(len)})`);
    const linie = put(`LINE('',${basis},${vektor})`);
    return put(`EDGE_CURVE('',${ecken[a]},${ecken[b]},${linie},.T.)`);
  };

  const K = {
    1: kante(0, 1), 2: kante(1, 2), 3: kante(2, 3), 4: kante(3, 0),
    5: kante(4, 5), 6: kante(5, 6), 7: kante(6, 7), 8: kante(7, 4),
    9: kante(0, 4), 10: kante(1, 5), 11: kante(2, 6), 12: kante(3, 7),
  };

  // Fläche: Stützpunkt, Normale, Referenzrichtung, Kantenzug
  const flaeche = (ort, normale, ref, zug) => {
    const ebene = put(`PLANE('',${put(`AXIS2_PLACEMENT_3D('',${pt(ort)},${dir(normale)},${dir(ref)})`)})`);
    const kanten = zug.map(([k, vorwaerts]) => put(`ORIENTED_EDGE('',*,*,${K[k]},${vorwaerts ? '.T.' : '.F.'})`));
    const schleife = put(`EDGE_LOOP('',(${kanten.join(',')}))`);
    const rand = put(`FACE_OUTER_BOUND('',${schleife},.T.)`);
    return put(`ADVANCED_FACE('',(${rand}),${ebene},.T.)`);
  };

  const flaechen = [
    flaeche([0, 0, 0], [0, 0, -1], [1, 0, 0], [[4, false], [3, false], [2, false], [1, false]]),
    flaeche([0, 0, H], [0, 0, 1], [1, 0, 0], [[5, true], [6, true], [7, true], [8, true]]),
    flaeche([0, 0, 0], [0, -1, 0], [1, 0, 0], [[1, true], [10, true], [5, false], [9, false]]),
    flaeche([L, 0, 0], [1, 0, 0], [0, 1, 0], [[2, true], [11, true], [6, false], [10, false]]),
    flaeche([0, W, 0], [0, 1, 0], [-1, 0, 0], [[3, true], [12, true], [7, false], [11, false]]),
    flaeche([0, 0, 0], [-1, 0, 0], [0, -1, 0], [[4, true], [9, true], [8, false], [12, false]]),
  ];

  const schale = put(`CLOSED_SHELL('',(${flaechen.join(',')}))`);
  const koerper = put(`MANIFOLD_SOLID_BREP('Quader',${schale})`);
  const platz = put(`AXIS2_PLACEMENT_3D('',${pt([0, 0, 0])},${dir([0, 0, 1])},${dir([1, 0, 0])})`);

  const kopf = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Cubory Testfixture'),'2;1');
FILE_NAME('quader.step','2026-01-01T00:00:00',('Cubory'),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
#1=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));
#2=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));
#3=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());
#4=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#1,'distance_accuracy_value','');
#5=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#4))GLOBAL_UNIT_ASSIGNED_CONTEXT((#1,#2,#3))REPRESENTATION_CONTEXT('',''));
#10=APPLICATION_CONTEXT('automotive design');
#11=APPLICATION_PROTOCOL_DEFINITION('','automotive_design',2000,#10);
#20=PRODUCT('Quader','Quader','',(#21));
#21=PRODUCT_CONTEXT('',#10,'mechanical');
#22=PRODUCT_DEFINITION_FORMATION('','',#20);
#23=PRODUCT_DEFINITION_CONTEXT('part definition',#10,'design');
#24=PRODUCT_DEFINITION('','',#22,#23);
#25=PRODUCT_DEFINITION_SHAPE('','',#24);
`;
  const schluss = `#90=ADVANCED_BREP_SHAPE_REPRESENTATION('',(${platz},${koerper}),#5);
#91=SHAPE_DEFINITION_REPRESENTATION(#25,#90);
ENDSEC;
END-ISO-10303-21;
`;
  return textBuffer(kopf + out.join('\n') + '\n' + schluss);
}

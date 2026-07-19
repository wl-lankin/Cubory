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

/** Zylinder mit Deckeln, als indiziertes Netz. Dient dem Gegenstück zur
 *  Würfelprüfung: gekrümmte Flächen müssen weich schattiert bleiben. Wer die
 *  Schattierung pauschal auf Facetten umstellt, sieht hier Kanten. */
export function plyCylinder(segments = 24, r = 20, h = 40) {
  const verts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    verts.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
    verts.push([Math.cos(a) * r, Math.sin(a) * r, h]);
  }
  const unten = verts.length;
  verts.push([0, 0, 0]);
  const oben = verts.length;
  verts.push([0, 0, h]);

  const faces = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = ((i + 1) % segments) * 2;
    faces.push([a, b, b + 1], [a, b + 1, a + 1]); // Mantel
    faces.push([unten, b, a], [oben, a + 1, b + 1]); // Deckel
  }

  return textBuffer(`ply\nformat ascii 1.0\nelement vertex ${verts.length}\n`
    + 'property float x\nproperty float y\nproperty float z\n'
    + `element face ${faces.length}\nproperty list uchar int vertex_indices\nend_header\n`
    + verts.map((v) => v.map((n) => n.toFixed(4)).join(' ')).join('\n') + '\n'
    + faces.map((f) => `3 ${f.join(' ')}`).join('\n') + '\n');
}

/* ── STL / OBJ ───────────────────────────────────────────────────────────── */

export function stlAscii() {
  const tri = CUBE_F.map((f) => {
    const v = f.map((i) => CUBE_V[i].join(' '));
    return `facet normal 0 0 1\n outer loop\n  vertex ${v[0]}\n  vertex ${v[1]}\n  vertex ${v[2]}\n endloop\nendfacet`;
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

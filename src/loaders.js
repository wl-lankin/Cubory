import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { parseString as parseDxf, denormalise, toPolylines, colors as dxfColors } from 'dxf';
import occtimportjs from 'occt-import-js';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';
import { COLORS } from './viewer.js';
import { t } from './i18n.js';

let occtPromise = null;
function getOcct() {
  if (!occtPromise) {
    occtPromise = occtimportjs({ locateFile: () => occtWasmUrl });
  }
  return occtPromise;
}

/**
 * Lädt eine CAD-Datei und liefert:
 * { object: THREE.Object3D, mode: '2d'|'3d', format, layers: [{name,color,count}] | null,
 *   parts: [name] | null, stats: { entities?, triangles? } }
 */
export async function loadCadFile(name, arrayBuffer, loadAs) {
  const ext = loadAs || name.split('.').pop().toLowerCase();
  switch (ext) {
    case 'dxf': {
      const result = loadDxf(arrayBuffer);
      if (name.toLowerCase().endsWith('.dwg')) result.format = 'DWG';
      return result;
    }
    case 'step':
    case 'stp':
      return loadOcct(arrayBuffer, 'step');
    case 'iges':
    case 'igs':
      return loadOcct(arrayBuffer, 'iges');
    case 'brep':
      return loadOcct(arrayBuffer, 'brep');
    case 'stl':
      return loadStl(arrayBuffer);
    case 'obj':
      return loadObj(arrayBuffer);
    case '3mf':
      return load3mf(arrayBuffer);
    case 'ply':
      return loadPly(arrayBuffer);
    case 'gltf':
    case 'glb':
      return loadGltf(arrayBuffer, ext.toUpperCase());
    default:
      throw new Error(t('error.format', { ext }));
  }
}

/* ── DXF (2D) ────────────────────────────────────────────────────────────── */

// Repariert DXF mit abgerissenen Textfortsetzungen (z.B. LibreDWG-Export):
// eine Wertzeile ohne vorangehenden Gruppencode verschiebt sonst die strikte
// Code/Wert-Alternierung des Parsers und ganze Sections gehen verloren.
function repairDxf(raw) {
  const lines = raw.split(/\r\n|\r|\n/g);
  const out = [];
  let expectCode = true;
  for (const line of lines) {
    if (expectCode && !/^\s*-?\d+\s*$/.test(line)) {
      if (out.length) out[out.length - 1] += line; // Chunk an vorigen Wert anhängen
      continue;
    }
    out.push(line);
    expectCode = !expectCode;
  }
  return out.join('\n');
}

function loadDxf(arrayBuffer) {
  const text = repairDxf(new TextDecoder('utf-8').decode(arrayBuffer));
  const parsed = parseDxf(text);
  const entities = denormalise(parsed);

  // Ebenen mit Anzahl der Entities einsammeln
  const layerCounts = new Map();
  for (const e of entities) {
    const layer = e.layer ?? '0';
    layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
  }

  const group = new THREE.Group();
  const layers = [];

  for (const [layerName, count] of layerCounts) {
    // Pro Ebene konvertieren, damit Ebenen ein-/ausblendbar sind
    const layerParsed = {
      ...parsed,
      entities: parsed.entities.filter((e) => (e.layer ?? '0') === layerName),
    };
    let polylines;
    try {
      polylines = toPolylines(layerParsed).polylines;
    } catch {
      continue;
    }
    if (!polylines.length) continue;

    // Segmente nach Farbe bündeln → wenige Draw-Calls
    const byColor = new Map();
    for (const p of polylines) {
      const rgb = normaliseRgb(p.rgb);
      const key = rgb;
      if (!byColor.has(key)) byColor.set(key, []);
      const verts = byColor.get(key);
      for (let i = 0; i < p.vertices.length - 1; i++) {
        const a = p.vertices[i];
        const b = p.vertices[i + 1];
        verts.push(a[0], a[1], 0, b[0], b[1], 0);
      }
    }

    const layerObj = new THREE.Group();
    layerObj.userData.layer = layerName;
    let displayColor = 0xffffff;
    for (const [rgb, verts] of byColor) {
      if (!verts.length) continue;
      displayColor = rgb;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      const mat = new THREE.LineBasicMaterial({ color: rgb });
      const lines = new THREE.LineSegments(geo, mat);
      lines.userData.layer = layerName;
      layerObj.add(lines);
    }
    group.add(layerObj);
    layers.push({ name: layerName, color: displayColor, count });
  }

  return {
    object: group,
    mode: '2d',
    format: 'DXF',
    layers: layers.sort((a, b) => a.name.localeCompare(b.name)),
    parts: null,
    stats: { entities: entities.length },
  };
}

/** DXF-Farben für dunklen Hintergrund lesbar machen.
 *  CAD-Dateien sind für weißes Papier gezeichnet - reines Blau (#0000FF) oder
 *  Schwarz verschwinden auf Navy. Wir heben deshalb die Helligkeit an und
 *  behalten den Farbton: Ebenen bleiben unterscheidbar, alles bleibt lesbar. */
const MIN_LIGHTNESS = 0.62;

function normaliseRgb(rgb) {
  let value;
  if (Array.isArray(rgb)) value = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  else if (typeof rgb === 'number') value = rgb;
  else value = 0xffffff;

  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  if (l >= MIN_LIGHTNESS) return value; // hell genug - Originalfarbe behalten

  const d = max - min;
  // Unbunte Farben (Schwarz, Grau, Weiß) auf den hellen UI-Ton bringen
  if (d < 0.04) return 0xdde2ff;

  let s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  if (h < 0) h += 1;

  // Reines Blau (240°) wirkt aufgehellt violett - und der Hintergrund ist
  // selbst blauviolett. Blautöne deshalb Richtung Azur ziehen, damit sie
  // eindeutig als Blau gelesen werden.
  if (h > 0.60 && h < 0.72) h = 0.56 + (h - 0.60) * 0.3;

  l = MIN_LIGHTNESS;
  s = Math.min(s, 0.78);

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h * 6) % 6;
  const [rr, gg, bb] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  const to255 = (v) => Math.round((v + m) * 255);
  return (to255(rr) << 16) | (to255(gg) << 8) | to255(bb);
}

/* ── STEP / IGES / BREP über OpenCascade (WASM) ─────────────────────────── */

async function loadOcct(arrayBuffer, kind) {
  const occt = await getOcct();
  const data = new Uint8Array(arrayBuffer);
  let result;
  if (kind === 'step') result = occt.ReadStepFile(data, null);
  else if (kind === 'iges') result = occt.ReadIgesFile(data, null);
  else result = occt.ReadBrepFile(data, null);

  if (!result || !result.success || !result.meshes?.length) {
    throw new Error(t('error.noGeometry'));
  }

  const group = new THREE.Group();
  const parts = [];
  let triangles = 0;

  result.meshes.forEach((meshData, i) => {
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3));
    // Index vor den Normalen: ohne ihn würde three die Dreiecke aus je drei
    // aufeinanderfolgenden Ecken bilden und damit für eine ganz andere
    // Aufteilung rechnen als die, die später gezeichnet wird.
    geo.setIndex(new THREE.Uint32BufferAttribute(meshData.index.array, 1));
    triangles += meshData.index.array.length / 3;
    if (meshData.attributes.normal) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3));
    } else {
      geo = ensureNormals(geo);
    }

    let color = COLORS.defaultMesh;
    if (meshData.color) {
      const [r, g, b] = meshData.color;
      color = new THREE.Color(r, g, b).getHex();
    }
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.35,
      roughness: 0.42,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const partName = meshData.name || t('part.fallback', { n: i + 1 });
    mesh.userData.part = partName;
    mesh.userData.partIndex = i;
    group.add(mesh);
    parts.push(partName);

    // Kantenlinien für den typischen CAD-Look
    const edges = new THREE.EdgesGeometry(geo, 28);
    const edgeLines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.55 })
    );
    edgeLines.userData.isEdgeLines = true;
    mesh.add(edgeLines);
  });

  return {
    object: group,
    mode: '3d',
    format: kind.toUpperCase(),
    layers: null,
    parts: dedupeParts(parts, group.children),
    stats: { triangles: Math.round(triangles) },
  };
}

/** Doppelte Teilenamen durchnummerieren - manche CAD-Exporte nennen jedes
 *  Bauteil „Part 1", was Teileliste und Explosionsansicht unbrauchbar macht. */
function dedupeParts(parts, meshes) {
  const totals = new Map();
  parts.forEach((n) => totals.set(n, (totals.get(n) || 0) + 1));
  const seen = new Map();
  return parts.map((base, i) => {
    if (totals.get(base) <= 1) return base;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const name = `${base} (${n})`;
    if (meshes[i]) meshes[i].userData.part = name;
    return name;
  });
}

/* ── STL / OBJ ───────────────────────────────────────────────────────────── */

/** Normalen ergänzen, wenn die Datei keine mitbringt.
 *  Nicht mit computeVertexNormals(): das mittelt die Normale über alle
 *  Flächen, die sich eine Ecke teilen. An einer 90-Grad-Kante verschmiert das
 *  die Schattierung - eine Kiste mit Rippen sieht aus, als wäre sie
 *  geschmolzen. toCreasedNormals() trennt die Ecken erst ab 60 Grad Knickwinkel
 *  und lässt gekrümmte Flächen (Bohrungen, Rundungen) weiterhin weich. */
function ensureNormals(geo) {
  return geo.getAttribute('normal') ? geo : toCreasedNormals(geo);
}

function meshMaterial() {
  return new THREE.MeshStandardMaterial({
    color: COLORS.defaultMesh,
    metalness: 0.35,
    roughness: 0.42,
    side: THREE.DoubleSide,
  });
}

function loadStl(arrayBuffer) {
  const geo = new STLLoader().parse(arrayBuffer);
  const mesh = new THREE.Mesh(ensureNormals(geo), meshMaterial());
  const group = new THREE.Group();
  group.add(mesh);
  const pos = geo.getAttribute('position');
  return {
    object: group,
    mode: '3d',
    format: 'STL',
    layers: null,
    parts: null,
    stats: { triangles: Math.round((geo.index ? geo.index.count : pos.count) / 3) },
  };
}

function loadObj(arrayBuffer) {
  const text = new TextDecoder('utf-8').decode(arrayBuffer);
  const object = new OBJLoader().parse(text);
  let triangles = 0;
  object.traverse((o) => {
    if (o.isMesh) {
      o.geometry = ensureNormals(o.geometry);
      o.material = meshMaterial();
      const pos = o.geometry.getAttribute('position');
      if (pos) triangles += (o.geometry.index ? o.geometry.index.count : pos.count) / 3;
    }
  });
  return {
    object,
    mode: '3d',
    format: 'OBJ',
    layers: null,
    parts: null,
    stats: { triangles: Math.round(triangles) },
  };
}

/* ── 3MF / PLY / GLTF ────────────────────────────────────────────────────── */

/** Bereitet einen geladenen Scene-Graph auf: CAD-Material vergeben, Dreiecke
 *  zählen und Bauteile benennen, damit Teileliste und Explosionsansicht auch
 *  bei Baugruppen aus diesen Formaten funktionieren. */
function collectParts(root, keepColors = false) {
  const parts = [];
  const meshes = [];
  let triangles = 0;

  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = ensureNormals(o.geometry);
    o.geometry = geo;

    // Farben aus der Datei behalten (3MF-Mehrmaterialdruck, GLTF-Materialien),
    // sonst den einheitlichen CAD-Look verwenden.
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const vertexColors = !!geo.getAttribute('color');
    const own = keepColors && (vertexColors || (src?.color && src.color.getHex() !== 0xffffff));
    o.material = own
      ? new THREE.MeshStandardMaterial({
          color: src?.color ? src.color.getHex() : 0xffffff,
          vertexColors,
          metalness: 0.25,
          roughness: 0.5,
          side: THREE.DoubleSide,
        })
      : meshMaterial();

    const pos = geo.getAttribute('position');
    if (pos) triangles += (geo.index ? geo.index.count : pos.count) / 3;

    const name = o.name || t('part.fallback', { n: parts.length + 1 });
    o.userData.part = name;
    o.userData.partIndex = parts.length;
    parts.push(name);
    meshes.push(o);
  });

  return { parts: dedupeParts(parts, meshes), triangles: Math.round(triangles) };
}

/** 3MF Production Extension: Slicer wie Bambu Studio oder PrusaSlicer legen die
 *  Geometrie in eigene 3D/Objects/*.model-Dateien und verweisen aus der
 *  Wurzeldatei darauf. three baut die Wurzeldatei zuerst und findet die
 *  verwiesenen Objekte dann noch nicht - der Loader bricht ab. Wir sortieren
 *  die Objektdateien deshalb nach vorne: beim Auflösen des Verweises liegen sie
 *  dann schon im gemeinsamen Objektspeicher. Praktisch jede aus einem Slicer
 *  exportierte 3MF-Datei ist so aufgebaut. */
function prepare3mf(arrayBuffer) {
  let zip;
  try {
    zip = unzipSync(new Uint8Array(arrayBuffer));
  } catch {
    return arrayBuffer; // kein lesbares Archiv - der Loader meldet das selbst
  }
  const names = Object.keys(zip);
  const isRoot = (n) => n.toLowerCase() === '3d/3dmodel.model';
  const external = names.filter((n) => /^3D\/.+\.model$/i.test(n) && !isRoot(n));
  if (!external.length) return arrayBuffer; // klassische 3MF, nichts zu tun

  const ordered = {};
  for (const n of external) ordered[n] = zip[n];
  for (const n of names) if (!(n in ordered)) ordered[n] = zip[n];
  // Ohne Kompression neu packen - das Archiv wird nur umsortiert und bleibt
  // im Arbeitsspeicher, erneutes Deflaten wäre verschenkte Zeit.
  return zipSync(ordered, { level: 0 });
}

function load3mf(arrayBuffer) {
  let object;
  try {
    object = new ThreeMFLoader().parse(prepare3mf(arrayBuffer));
  } catch {
    // three meldet Archivprobleme auf Englisch und mit Klassennamen - für den
    // Nutzer ist nur relevant, dass die Datei nicht lesbar ist.
    throw new Error(t('error.noGeometry'));
  }
  const { parts, triangles } = collectParts(object, true);
  if (!triangles) throw new Error(t('error.noGeometry'));
  return {
    object,
    mode: '3d',
    format: '3MF',
    layers: null,
    parts: parts.length > 1 ? parts : null,
    stats: { triangles },
  };
}

function loadPly(arrayBuffer) {
  const geo = new PLYLoader().parse(arrayBuffer);
  const group = new THREE.Group();
  const vertexColors = !!geo.getAttribute('color');
  const count = geo.getAttribute('position')?.count ?? 0;
  if (!count) throw new Error(t('error.noGeometry'));

  // PLY ohne Flächen ist eine Punktwolke (3D-Scan) - die als Mesh zu zeichnen
  // ergäbe ein leeres Bild.
  if (!geo.index) {
    const mat = new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors });
    if (!vertexColors) mat.color.set(COLORS.defaultMesh);
    group.add(new THREE.Points(geo, mat));
    return {
      object: group,
      mode: '3d',
      format: 'PLY',
      layers: null,
      parts: null,
      stats: { points: count },
    };
  }

  const dreiecke = Math.round(geo.index.count / 3);
  const beschattet = ensureNormals(geo);
  const mat = vertexColors
    ? new THREE.MeshStandardMaterial({ vertexColors, metalness: 0.25, roughness: 0.5, side: THREE.DoubleSide })
    : meshMaterial();
  group.add(new THREE.Mesh(beschattet, mat));
  return {
    object: group,
    mode: '3d',
    format: 'PLY',
    layers: null,
    parts: null,
    stats: { triangles: dreiecke },
  };
}

function loadGltf(arrayBuffer, format) {
  return new Promise((resolve, reject) => {
    // Zweites Argument ist der Basispfad für externe Texturen - lokal geladene
    // Dateien bringen keine mit, .glb hat ohnehin alles eingebettet.
    new GLTFLoader().parse(
      arrayBuffer,
      '',
      (gltf) => {
        const object = gltf.scene || gltf.scenes?.[0];
        const { parts, triangles } = object ? collectParts(object, true) : {};
        if (!triangles) {
          reject(new Error(t('error.noGeometry')));
          return;
        }
        resolve({
          object,
          mode: '3d',
          format,
          layers: null,
          parts: parts.length > 1 ? parts : null,
          stats: { triangles },
        });
      },
      () => reject(new Error(t('error.noGeometry')))
    );
  });
}

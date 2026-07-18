import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
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
export async function loadCadFile(name, arrayBuffer) {
  const ext = name.split('.').pop().toLowerCase();
  switch (ext) {
    case 'dxf':
      return loadDxf(arrayBuffer);
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
    default:
      throw new Error(t('error.format', { ext }));
  }
}

/* ── DXF (2D) ────────────────────────────────────────────────────────────── */

function loadDxf(arrayBuffer) {
  const text = new TextDecoder('utf-8').decode(arrayBuffer);
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

/** dxf liefert rgb je nach Quelle als [r,g,b] oder Zahl - auf helle Farben mappen */
function normaliseRgb(rgb) {
  let value;
  if (Array.isArray(rgb)) value = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  else if (typeof rgb === 'number') value = rgb;
  else value = 0xffffff;
  // Sehr dunkle Linien (schwarz für weißes Papier) auf dem dunklen UI aufhellen
  const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
  if (r + g + b < 90) return 0xdde2ff;
  return value;
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3));
    if (meshData.attributes.normal) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3));
    } else {
      geo.computeVertexNormals();
    }
    geo.setIndex(new THREE.Uint32BufferAttribute(meshData.index.array, 1));
    triangles += meshData.index.array.length / 3;

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

  // Doppelte Teilenamen durchnummerieren (manche CAD-Exporte nennen alles „Part 1")
  const totals = new Map();
  parts.forEach((n) => totals.set(n, (totals.get(n) || 0) + 1));
  const seen = new Map();
  group.children.forEach((mesh, i) => {
    const base = parts[i];
    if (totals.get(base) > 1) {
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      parts[i] = `${base} (${n})`;
      mesh.userData.part = parts[i];
    }
  });

  return {
    object: group,
    mode: '3d',
    format: kind.toUpperCase(),
    layers: null,
    parts,
    stats: { triangles: Math.round(triangles) },
  };
}

/* ── STL / OBJ ───────────────────────────────────────────────────────────── */

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
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, meshMaterial());
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

// Tests für den Dateiimport. Geprüft wird über loadCadFile(), also über die
// Schnittstelle, die die App tatsächlich benutzt - nicht über interne Helfer.
// Jeder Regressionstest hier steht für einen Fehler, den echte Dateien in
// diesem Projekt schon einmal ausgelöst haben.
import { describe, it, expect } from 'vitest';
import { loadCadFile } from '../src/loaders.js';
import {
  dxfWithLayers, dxfWithBrokenGroupCode, plyMesh, plyPointCloud,
  stlAscii, objCube, glbAssembly, threeMfClassic, threeMfProduction, plyCylinder,
} from './fixtures.js';

/** Normalen eines Modells als Liste von [x,y,z] je Ecke. */
function normalen(result) {
  const out = [];
  result.object.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.geometry.getAttribute('normal');
    const idx = o.geometry.index;
    const anzahl = idx ? idx.count : n.count;
    for (let i = 0; i < anzahl; i++) {
      const v = idx ? idx.getX(i) : i;
      out.push([n.getX(v), n.getY(v), n.getZ(v)]);
    }
  });
  return out;
}

// Bewusst von Hand gerechnet statt über THREE.Color: dessen getHSL() liefert
// Werte im linearen Arbeitsfarbraum und würde hier andere Zahlen zeigen als
// die, die tatsächlich in der Datei stehen.
function hsl(hex) {
  const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (!d) return { h: 0, s: 0, l };
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2
    : (r - g) / d + 4;
  return { h: h * 60, s: d / (1 - Math.abs(2 * l - 1)), l };
}

describe('DXF', () => {
  it('liest Ebenen und Elemente', async () => {
    const r = await loadCadFile('t.dxf', dxfWithLayers({ AUSSEN: 5, INNEN: 1 }));
    expect(r.format).toBe('DXF');
    expect(r.mode).toBe('2d');
    expect(r.stats.entities).toBe(2);
    expect(r.layers.map((l) => l.name)).toEqual(['AUSSEN', 'INNEN']);
  });

  // Regression: dwg2dxf schreibt Textfortsetzungen ohne Gruppencode. Das
  // verschob die Code/Wert-Abwechslung, worauf der Parser die komplette
  // ENTITIES-Section verwarf - eine echte DWG kam mit 0 Elementen an.
  it('verkraftet Wertzeilen ohne Gruppencode (LibreDWG-Export)', async () => {
    const r = await loadCadFile('t.dxf', dxfWithBrokenGroupCode());
    expect(r.stats.entities).toBeGreaterThan(0);
  });

  it('meldet DWG als Format, wenn die Datei aus einer DWG konvertiert wurde', async () => {
    const r = await loadCadFile('zeichnung.dwg', dxfWithLayers({ '0': 7 }), 'dxf');
    expect(r.format).toBe('DWG');
  });
});

describe('DXF-Farben auf dunklem Hintergrund', () => {
  // CAD-Dateien sind für weißes Papier gezeichnet. Reines Blau und Schwarz
  // verschwanden auf dem dunklen Hintergrund praktisch vollständig.
  it('hellt dunkle Farben auf', async () => {
    const r = await loadCadFile('t.dxf', dxfWithLayers({ BLAU: 5 }));
    expect(hsl(r.layers[0].color).l).toBeGreaterThan(0.5);
  });

  // Reines Blau liegt bei 240° und wirkt aufgehellt violett - der Hintergrund
  // ist selbst blauviolett. Es muss klar als Blau lesbar bleiben.
  it('lässt Blau nicht ins Violette kippen', async () => {
    const { h, s } = hsl((await loadCadFile('t.dxf', dxfWithLayers({ BLAU: 5 }))).layers[0].color);
    expect(h).toBeGreaterThan(190);
    expect(h).toBeLessThan(225);
    expect(s).toBeGreaterThan(0.3); // nicht zu grau werden
  });

  it('behält den Farbton, damit Ebenen unterscheidbar bleiben', async () => {
    const r = await loadCadFile('t.dxf', dxfWithLayers({ ROT: 1, GRUEN: 3, BLAU: 5 }));
    const [rot, gruen, blau] = ['ROT', 'GRUEN', 'BLAU']
      .map((n) => hsl(r.layers.find((l) => l.name === n).color).h);
    expect(rot).toBeLessThan(30);
    expect(gruen).toBeGreaterThan(90);
    expect(gruen).toBeLessThan(150);
    expect(blau).toBeGreaterThan(190);
  });

  it('lässt bereits helle Farben unverändert', async () => {
    // ACI 7 ist Weiß - daran darf nicht herumgerechnet werden.
    const r = await loadCadFile('t.dxf', dxfWithLayers({ HELL: 7 }));
    expect(hsl(r.layers[0].color).l).toBeGreaterThan(0.6);
  });
});

describe('Mesh-Formate', () => {
  it('lädt STL', async () => {
    const r = await loadCadFile('t.stl', stlAscii());
    expect(r.format).toBe('STL');
    expect(r.stats.triangles).toBe(12);
  });

  it('lädt OBJ', async () => {
    const r = await loadCadFile('t.obj', objCube());
    expect(r.format).toBe('OBJ');
    expect(r.stats.triangles).toBe(12);
  });

  it('lädt PLY mit Flächen als Mesh', async () => {
    const r = await loadCadFile('t.ply', plyMesh());
    expect(r.format).toBe('PLY');
    expect(r.stats.triangles).toBe(12);
    expect(r.stats.points).toBeUndefined();
  });

  // PLY aus 3D-Scans hat oft keine Flächen. Als Mesh gezeichnet bliebe das
  // Bild leer - der Nutzer sähe eine scheinbar kaputte Datei.
  it('zeichnet PLY ohne Flächen als Punktwolke', async () => {
    const r = await loadCadFile('scan.ply', plyPointCloud(500));
    expect(r.stats.points).toBe(500);
    expect(r.stats.triangles).toBeUndefined();
    let punkte = 0;
    r.object.traverse((o) => { if (o.isPoints) punkte++; });
    expect(punkte).toBe(1);
  });
});

describe('GLTF', () => {
  it('liefert benannte Teile einer Baugruppe', async () => {
    const r = await loadCadFile('t.glb', glbAssembly());
    expect(r.format).toBe('GLB');
    expect(r.parts).toEqual(['Gehäuse', 'Deckel']);
    expect(r.stats.triangles).toBe(24);
  });

  it('macht die Teile für die Explosionsansicht ansprechbar', async () => {
    const r = await loadCadFile('t.glb', glbAssembly());
    const teile = [];
    r.object.traverse((o) => { if (o.isMesh) teile.push(o.userData.part); });
    expect(teile).toEqual(['Gehäuse', 'Deckel']);
  });
});

describe('3MF', () => {
  it('lädt eine klassische 3MF', async () => {
    const r = await loadCadFile('t.3mf', threeMfClassic());
    expect(r.format).toBe('3MF');
    expect(r.stats.triangles).toBe(12);
  });

  // Regression: Alle sechs echten Slicer-Dateien im Test stürzten ab, weil die
  // Geometrie über die Production Extension in eigenen Dateien liegt und three
  // die Wurzeldatei zuerst baut. Praktisch jeder Slicer-Export ist so gebaut.
  it('lädt 3MF mit Production Extension (Slicer-Export)', async () => {
    const r = await loadCadFile('slicer.3mf', threeMfProduction());
    expect(r.stats.triangles).toBe(12);
  });
});

// Regression: Normalen wurden mit computeVertexNormals() berechnet, das über
// alle Flächen an einer Ecke mittelt. Auf einer Kiste mit Rippen verschmierte
// das die Schattierung, als wäre das Teil geschmolzen. Die beiden Tests fangen
// bewusst beide Fehlerrichtungen: pauschales Mitteln und pauschales Facettieren.
describe('Schattierung', () => {
  it('hält Kanten an rechten Winkeln scharf', async () => {
    const werte = normalen(await loadCadFile('t.3mf', threeMfClassic()));
    expect(werte.length).toBeGreaterThan(0);
    for (const [x, y, z] of werte) {
      // Am Würfel zeigt jede Normale entlang einer Achse. Gemittelte Normalen
      // an den Ecken zeigen dagegen schräg in den Raum.
      const achsen = [x, y, z].filter((k) => Math.abs(Math.abs(k) - 1) < 0.01);
      expect(achsen).toHaveLength(1);
    }
  });

  it('lässt gekrümmte Flächen weich', async () => {
    const r = await loadCadFile('zyl.ply', plyCylinder(24));
    const geo = r.object.children[0].geometry;
    const n = geo.getAttribute('normal');
    const idx = geo.index;
    // Dreiecke über den Index auflösen. Ohne das würde der Test bei
    // indizierter Geometrie beliebige Ecken zu Dreiecken zusammenfassen und
    // damit etwas ganz anderes messen als die Schattierung.
    const ecke = (i) => {
      const v = idx ? idx.getX(i) : i;
      return [n.getX(v), n.getY(v), n.getZ(v)];
    };
    let weich = 0;
    let mantel = 0;
    const anzahl = idx ? idx.count : n.count;
    for (let i = 0; i < anzahl; i += 3) {
      const drei = [0, 1, 2].map((k) => ecke(i + k));
      if (drei.some(([, , z]) => Math.abs(z) > 0.1)) continue; // Deckel überspringen
      mantel++;
      const gleich = drei.every(([x, y]) =>
        Math.abs(x - drei[0][0]) < 1e-4 && Math.abs(y - drei[0][1]) < 1e-4);
      if (!gleich) weich++;
    }
    expect(mantel, 'keine Mantelfläche gefunden - die Randnormalen sind '
      + 'vermutlich mit denen der Deckel vermischt').toBeGreaterThan(0);
    expect(weich, 'Mantelflächen sind facettiert statt weich schattiert').toBeGreaterThan(0);
  });
});

describe('Fehlerfälle', () => {
  it('lehnt unbekannte Endungen ab', async () => {
    await expect(loadCadFile('t.xyz', stlAscii())).rejects.toThrow();
  });

  it('meldet unlesbare Dateien, statt still nichts zu tun', async () => {
    const müll = new TextEncoder().encode('das ist keine CAD-Datei').buffer;
    for (const name of ['t.ply', 't.3mf', 't.glb']) {
      await expect(loadCadFile(name, müll)).rejects.toThrow();
    }
  });
});

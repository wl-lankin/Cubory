import * as THREE from 'three';

// Intro-Sequenz: Partikel wirbeln aus dem Off herein, verdichten sich zum
// Cubory-Kristall (Ikosaeder aus Lichtpunkten), der rotiert und pulsiert -
// dann zerbirst er in einer Schockwelle und gibt die UI frei.
//
// Zeitplan (Sekunden):
//   0.0 - 1.6  Vortex: Spiralflug auf die Kristallkanten
//   1.6 - 2.6  Kristall steht, rotiert, glimmt, Funken wandern
//   2.6 - 3.3  Explosion + Schockwelle + Blitz, Overlay blendet aus

const DURATION = 3.4;
const T_EXPLODE = 2.6;

const PINK = new THREE.Color('#ff3d8a');
const VIOLET = new THREE.Color('#7c5cff');
const WHITE = new THREE.Color('#ffffff');

const smootherstep = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// Weicher runder Punkt als Sprite-Textur
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Sehr weicher Glow für den Kern: exponentieller Abfall ohne sichtbare Kante
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.0, 'rgba(255,150,210,0.5)');
  g.addColorStop(0.18, 'rgba(255,120,200,0.26)');
  g.addColorStop(0.4, 'rgba(200,110,255,0.12)');
  g.addColorStop(0.65, 'rgba(150,100,255,0.05)');
  g.addColorStop(0.85, 'rgba(130,95,255,0.02)');
  g.addColorStop(1.0, 'rgba(120,90,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function playIntro(onDone) {
  const layer = document.createElement('div');
  layer.id = 'intro-layer';
  document.body.appendChild(layer);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  layer.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 0, 36);

  // ── Ziel: Punkte auf den Kanten eines Ikosaeders ───────────────────────────
  const N = 5200;
  const edges = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(6.2, 0));
  const ep = edges.getAttribute('position');
  const edgeCount = ep.count / 2;

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const start = new Float32Array(N * 3);
  const target = new Float32Array(N * 3);
  const explodeDir = new Float32Array(N * 3);
  const delay = new Float32Array(N);
  const twinkle = new Float32Array(N);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    // Ziel: zufälliger Punkt auf einer zufälligen Kristallkante
    const e = Math.floor(Math.random() * edgeCount);
    a.fromBufferAttribute(ep, e * 2);
    b.fromBufferAttribute(ep, e * 2 + 1);
    v.lerpVectors(a, b, Math.random());
    target.set([v.x, v.y, v.z], i * 3);

    // Start: weit draußen auf einer Kugelschale, seitlich betont
    const r = 16 + Math.random() * 24;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    start.set(
      [r * Math.sin(phi) * Math.cos(theta), (r * Math.cos(phi)) * 0.6, r * Math.sin(phi) * Math.sin(theta)],
      i * 3
    );

    // Explosion: entlang der Zielrichtung nach außen, mit Streuung
    v.normalize();
    explodeDir.set(
      [v.x + (Math.random() - 0.5) * 0.7, v.y + (Math.random() - 0.5) * 0.7, v.z + (Math.random() - 0.5) * 0.7],
      i * 3
    );

    delay[i] = Math.random() * 0.45;
    twinkle[i] = Math.random() * Math.PI * 2;

    // Farbverlauf Pink → Violett, ~8 % weiße Funken
    const c = Math.random() < 0.08 ? WHITE : PINK.clone().lerp(VIOLET, Math.random());
    colors.set([c.r, c.g, c.b], i * 3);
    positions.set(start.slice(i * 3, i * 3 + 3), i * 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.3,
    map: dotTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // ── Glühender Kern ─────────────────────────────────────────────────────────
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    })
  );
  scene.add(core);

  // ── Schockwellen-Ring ──────────────────────────────────────────────────────
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1, 96),
    new THREE.MeshBasicMaterial({
      color: PINK,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  scene.add(ring);

  // ── Blitz-Overlay (DOM) ────────────────────────────────────────────────────
  const flash = document.createElement('div');
  flash.id = 'intro-flash';
  layer.appendChild(flash);

  const onResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  let finished = false;
  const clock = new THREE.Clock();

  function finish() {
    if (finished) return;
    finished = true;
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointerdown', skip);
    window.removeEventListener('keydown', skip);
    layer.classList.add('out');
    setTimeout(() => {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      layer.remove();
    }, 550);
    onDone?.();
  }

  // Klick oder Taste überspringt das Intro. Schonfrist gegen Geisterevents
  // beim App-Start; nur echte, gezielte Eingaben zählen.
  const skip = (e) => {
    if (!e.isTrusted || clock.getElapsedTime() < 0.4) return;
    if (e.type === 'keydown' && !['Escape', 'Enter', ' '].includes(e.key)) return;
    finish();
  };
  window.addEventListener('pointerdown', skip);
  window.addEventListener('keydown', skip);

  const pos = geo.getAttribute('position');
  const rot = new THREE.Matrix4();

  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    if (t >= DURATION) return finish();

    const tE = Math.max(0, t - T_EXPLODE);
    const eExpl = smootherstep(tE / 0.7);

    let arrived = 0;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const e1 = smootherstep((t - delay[i]) / 1.45);
      arrived += e1;

      // Spiralflug: Startpunkt dreht sich um die Y-Achse, während er zum Ziel zieht
      const swirl = (1 - e1) * Math.PI * 3.2;
      const cs = Math.cos(swirl), sn = Math.sin(swirl);
      const sx = start[i3], sy = start[i3 + 1], sz = start[i3 + 2];
      const rx = sx * cs - sz * sn;
      const rz = sx * sn + sz * cs;

      let x = rx + (target[i3] - rx) * e1;
      let y = sy + (target[i3 + 1] - sy) * e1;
      let z = rz + (target[i3 + 2] - rz) * e1;

      // Angekommen: feines Glimmern entlang der Kante
      if (e1 >= 1 && eExpl === 0) {
        const w = Math.sin(t * 7 + twinkle[i]) * 0.045;
        x += w; y += w * 0.6; z -= w * 0.4;
      }

      // Explosion: nach außen beschleunigen
      if (eExpl > 0) {
        const d = eExpl * eExpl * 34;
        x += explodeDir[i3] * d;
        y += explodeDir[i3 + 1] * d;
        z += explodeDir[i3 + 2] * d;
      }

      pos.array[i3] = x;
      pos.array[i3 + 1] = y;
      pos.array[i3 + 2] = z;
    }
    pos.needsUpdate = true;
    const arrivedFrac = arrived / N;

    // Kristall dreht sich, sobald er Form annimmt; Puls beim Stehen
    points.rotation.y = t * 0.55;
    points.rotation.x = Math.sin(t * 0.8) * 0.12;
    const pulse = 1 + Math.sin(t * 9) * 0.02 * arrivedFrac;
    points.scale.setScalar(pulse * (1 + eExpl * 0.15));

    // Kern: wächst mit der Verdichtung, birst bei der Explosion
    core.material.opacity = Math.max(0, arrivedFrac * 0.8 - eExpl * 1.4);
    core.scale.setScalar(10 + arrivedFrac * 16 + eExpl * 30);

    // Schockwelle
    if (eExpl > 0) {
      ring.material.opacity = (1 - eExpl) * 0.9;
      ring.scale.setScalar(0.5 + eExpl * 46);
      flash.style.opacity = String(Math.max(0, 0.85 - eExpl * 1.15));
    }

    // Kamera: langsamer Dolly rein, FOV-Punch bei der Explosion
    camera.position.z = 36 - smootherstep(t / DURATION) * 7;
    camera.fov = 45 + eExpl * 14;
    camera.updateProjectionMatrix();

    // Partikel-Material blendet am Ende aus
    mat.opacity = 1 - smootherstep((t - (T_EXPLODE + 0.25)) / 0.5);

    renderer.render(scene, camera);
  });

  return { finish };
}

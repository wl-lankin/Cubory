// Cubory Landing - Hero: der Partikel-Kristall aus dem App-Intro als
// dauerhafte, scroll-gesteuerte Szene. Beim Scrollen zerfällt der Kristall
// in Sternenstaub (Explosion = Scrollfortschritt), die Maus neigt die Kamera.
import * as THREE from 'three';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scroll-Reveals
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

if (!reduced) {
  const canvas = document.getElementById('hero-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  camera.position.set(0, 0, 34);

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  // weicher Punkt als Textur
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const dot = new THREE.CanvasTexture(c);

  // Kristallkanten + Staub
  const N = 3600, DUST = 500;
  const edges = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(6, 0));
  const ep = edges.getAttribute('position');
  const pos = new Float32Array((N + DUST) * 3);
  const col = new Float32Array((N + DUST) * 3);
  const target = new Float32Array(N * 3);
  const dir = new Float32Array(N * 3);
  const tw = new Float32Array(N);
  const PINK = new THREE.Color('#ff3d8a'), VIOLET = new THREE.Color('#7c5cff'), W = new THREE.Color('#fff');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const e = (Math.random() * ep.count / 2) | 0;
    a.fromBufferAttribute(ep, e * 2); b.fromBufferAttribute(ep, e * 2 + 1);
    v.lerpVectors(a, b, Math.random());
    target.set([v.x, v.y, v.z], i * 3);
    v.normalize();
    dir.set([v.x + (Math.random() - .5) * .8, v.y + (Math.random() - .5) * .8, v.z + (Math.random() - .5) * .8], i * 3);
    tw[i] = Math.random() * Math.PI * 2;
    const cl = Math.random() < .08 ? W : PINK.clone().lerp(VIOLET, Math.random());
    col.set([cl.r, cl.g, cl.b], i * 3);
  }
  for (let i = N; i < N + DUST; i++) {
    pos.set([(Math.random() - .5) * 90, (Math.random() - .5) * 60, (Math.random() - .5) * 40 - 10], i * 3);
    const cl = PINK.clone().lerp(VIOLET, Math.random()).multiplyScalar(.7);
    col.set([cl.r, cl.g, cl.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: .17, opacity: .55, map: dot, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(pts);

  // Kristall rechts neben dem Hero-Text positionieren
  pts.position.set(13, 1, -6);

  let mx = 0, my = 0;
  addEventListener('pointermove', (e) => {
    mx = (e.clientX / innerWidth - .5) * 2;
    my = (e.clientY / innerHeight - .5) * 2;
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    // Explosion folgt dem Scrollfortschritt über die erste Viewport-Höhe
    const f = Math.min(scrollY / (innerHeight * .9), 1);
    const spread = f * f * 30;
    const attr = geo.getAttribute('position');
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const wob = Math.sin(t * 2.2 + tw[i]) * .05;
      attr.array[i3] = target[i3] + dir[i3] * spread + wob;
      attr.array[i3 + 1] = target[i3 + 1] + dir[i3 + 1] * spread + wob * .6;
      attr.array[i3 + 2] = target[i3 + 2] + dir[i3 + 2] * spread;
    }
    attr.needsUpdate = true;
    pts.rotation.y = t * .25;
    pts.rotation.x = Math.sin(t * .4) * .1;
    pts.material.opacity = .55 * (1 - f * .9);
    camera.position.x = mx * 2.2;
    camera.position.y = -my * 1.6;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  });
}

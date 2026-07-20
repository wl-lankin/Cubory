import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Farbwelt des Viewers - abgestimmt auf das UI
const COLORS = {
  gridMajor: 0x2c3474,
  gridMinor: 0x1a2050,
  defaultMesh: 0xb9c2ec,
  edge: 0x0b0f2e,
};

export class Viewer {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1e7);
    this.camera.position.set(120, 100, 120);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Modell-Gruppe: CAD ist Z-hoch, three.js Y-hoch → um X drehen
    this.modelGroup = new THREE.Group();
    this.modelGroup.rotation.x = -Math.PI / 2;
    this.scene.add(this.modelGroup);

    // Licht
    const hemi = new THREE.HemisphereLight(0xcdd4ff, 0x241d55, 1.15);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 2, 1.5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8f7cff, 0.5);
    fill.position.set(-1.5, -0.6, -1);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff3d8a, 0.35);
    rim.position.set(0.5, -1.5, 0.8);
    this.scene.add(rim);

    this.grid = null;
    this.gridVisible = true;
    this.edgesVisible = true;
    this.wireframe = false;
    this.is2D = false;

    this._resize = this._resize.bind(this);
    new ResizeObserver(this._resize).observe(container);
    this._resize();

    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.onFrame?.();
    });
  }

  _resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Entfernt das aktuelle Modell aus der Szene, ohne es freizugeben -
  // Tabs halten ihre Modelle im Speicher. Freigabe: disposeObject().
  clear() {
    for (const child of [...this.modelGroup.children]) {
      this.modelGroup.remove(child);
    }
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
      this.grid = null;
    }
  }

  /** Gibt die GPU-Ressourcen eines (geschlossenen) Modells frei. */
  disposeObject(root) {
    root?.traverse?.((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose?.();
    });
  }

  /** Kamerazustand für Tab-Wechsel sichern/wiederherstellen. */
  saveCamera() {
    return { pos: this.camera.position.clone(), target: this.controls.target.clone(),
      near: this.camera.near, far: this.camera.far };
  }

  restoreCamera(cam) {
    this.camera.position.copy(cam.pos);
    this.camera.near = cam.near;
    this.camera.far = cam.far;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(cam.target);
    this.controls.update();
  }

  /** Modell (THREE.Object3D) anzeigen; mode: '2d' | '3d' */
  setModel(object, mode) {
    this.clearMeasurements?.();
    this._explodeBase = null;
    this.setSection(null);
    this.clear();
    this.is2D = mode === '2d';
    this.modelGroup.add(object);
    this._buildGrid();
    this.controls.enableRotate = !this.is2D;
    this.controls.mouseButtons.LEFT = this.is2D ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.screenSpacePanning = true;
    this.setView(this.is2D ? 'top' : 'iso');
  }

  _bbox() {
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    return box;
  }

  _buildGrid() {
    const box = this._bbox();
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z, 1);
    // Rasterweite auf „schöne" Schritte runden (1/2/5 × 10^n)
    const step = niceStep(maxDim / 10);
    const extent = step * Math.ceil((maxDim * 1.6) / step / 2) * 2;
    this.grid = new THREE.GridHelper(extent, Math.round(extent / step), COLORS.gridMajor, COLORS.gridMinor);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.5;
    this.grid.position.y = box.min.y - Math.max(size.y * 0.02, 0.1);
    const center = box.getCenter(new THREE.Vector3());
    this.grid.position.x = 0;
    this.grid.position.z = 0;
    this.grid.visible = this.gridVisible;
    this.scene.add(this.grid);
    this._gridCenter = center;
  }

  setView(view) {
    const box = this._bbox();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.5);
    const dist = radius / Math.tan((this.camera.fov * Math.PI) / 360) * 1.15;

    const dirs = {
      iso: new THREE.Vector3(1, 0.75, 1).normalize(),
      top: new THREE.Vector3(0, 1, 0.0001).normalize(),
      front: new THREE.Vector3(0, 0.0001, 1).normalize(),
      right: new THREE.Vector3(1, 0.0001, 0.0001).normalize(),
    };
    const dir = dirs[view] || dirs.iso;

    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = Math.max(dist / 1000, 0.001);
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  fit() {
    this.setView(this.is2D ? 'top' : 'iso');
  }

  toggleGrid() {
    this.gridVisible = !this.gridVisible;
    if (this.grid) this.grid.visible = this.gridVisible;
    return this.gridVisible;
  }

  toggleWireframe() {
    this.wireframe = !this.wireframe;
    this.modelGroup.traverse((o) => {
      if (o.isMesh) o.material.wireframe = this.wireframe;
    });
    return this.wireframe;
  }

  toggleEdges() {
    this.edgesVisible = !this.edgesVisible;
    this.modelGroup.traverse((o) => {
      // Kanten von „geisterhaften" (isolierten) Teilen bleiben aus
      if (o.userData.isEdgeLines && o.parent?.material?.opacity !== 0.07) {
        o.visible = this.edgesVisible;
      }
    });
    return this.edgesVisible;
  }

  setLayerVisible(layerName, visible) {
    this.modelGroup.traverse((o) => {
      if (o.userData.layer === layerName) o.visible = visible;
    });
  }

  setPartVisible(partIndex, visible) {
    this.modelGroup.traverse((o) => {
      if (o.isMesh && o.userData.partIndex === partIndex) o.visible = visible;
    });
  }

  /** Ein Teil hervorheben: alle anderen werden durchsichtig, Ansicht zoomt auf das Teil.
   *  isolatePart(null) stellt alles wieder her. */
  isolatePart(partIndex) {
    this.isolatedPart = partIndex ?? null;
    const targets = [];
    this.modelGroup.traverse((o) => {
      if (!o.isMesh || o.userData.partIndex === undefined) return;
      const isTarget = partIndex != null && o.userData.partIndex === partIndex;
      const ghost = partIndex != null && !isTarget;
      o.material.transparent = ghost;
      o.material.opacity = ghost ? 0.07 : 1;
      o.material.depthWrite = !ghost;
      o.material.needsUpdate = true;
      // Kantenlinien der geisterhaften Teile ausblenden
      o.children.forEach((c) => {
        if (c.userData.isEdgeLines) c.visible = ghost ? false : this.edgesVisible;
      });
      if (isTarget) targets.push(o);
    });
    if (targets.length) this.fitToObjects(targets);
    else if (partIndex == null) this.fit();
  }

  fitToObjects(objects) {
    const box = new THREE.Box3();
    objects.forEach((o) => box.union(new THREE.Box3().setFromObject(o)));
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.5);
    const dist = radius / Math.tan((this.camera.fov * Math.PI) / 360) * 1.2;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = Math.max(dist / 1000, 0.001);
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  /* ── Messwerkzeuge ─────────────────────────────────────────────────────── */

  /** Raycast auf das Modell; 2D: Schnitt mit der Zeichenebene. Liefert Weltpunkt. */
  pickPoint(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes = [];
    this.modelGroup.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) {
      // Snapping: rastet auf den nächsten Eckpunkt des getroffenen Dreiecks
      // ein, wenn er auf dem Bildschirm nah genug liegt (Kanten/Ecken von
      // CAD-Modellen bestehen aus solchen Vertices).
      if (hit.face && hit.object.geometry) {
        const pos = hit.object.geometry.getAttribute('position');
        let best = null, bestPx = 14;
        for (const idx of [hit.face.a, hit.face.b, hit.face.c]) {
          const v = new THREE.Vector3().fromBufferAttribute(pos, idx)
            .applyMatrix4(hit.object.matrixWorld);
          const s = this.toScreen(v);
          const px = Math.hypot(s.x - (clientX - rect.left), s.y - (clientY - rect.top));
          if (px < bestPx) { bestPx = px; best = v; }
        }
        if (best) return best;
      }
      return hit.point;
    }
    if (this.is2D) {
      const p = new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return p;
    }
    return null;
  }

  /** Fügt einen Messpunkt hinzu; bei jedem zweiten Punkt entsteht eine Messung.
   *  Rückgabe: {distance} wenn eine Messung fertig wurde, sonst null. */
  addMeasurePoint(point) {
    if (!this.measureGroup) {
      this.measureGroup = new THREE.Group();
      this.scene.add(this.measureGroup);
      this.measurements = [];
    }
    const size = this._bbox().getSize(new THREE.Vector3()).length() || 100;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.004, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3d8a, depthTest: false, transparent: true })
    );
    marker.renderOrder = 10;
    marker.position.copy(point);
    this.measureGroup.add(marker);

    if (!this._pendingPoint) {
      this._pendingPoint = point.clone();
      return null;
    }
    const a = this._pendingPoint;
    this._pendingPoint = null;
    const geo = new THREE.BufferGeometry().setFromPoints([a, point]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xff3d8a, depthTest: false, transparent: true,
    }));
    line.renderOrder = 10;
    this.measureGroup.add(line);
    const m = { a, b: point.clone(), distance: a.distanceTo(point) };
    this.measurements.push(m);
    return m;
  }

  clearMeasurements() {
    this._pendingPoint = null;
    if (this.measureGroup) {
      this.scene.remove(this.measureGroup);
      this.measureGroup.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      this.measureGroup = null;
    }
    this.measurements = [];
  }

  /** Projiziert einen Weltpunkt auf Container-Pixel (für HTML-Labels). */
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return {
      x: (p.x + 1) / 2 * this.container.clientWidth,
      y: (-p.y + 1) / 2 * this.container.clientHeight,
      visible: p.z < 1,
    };
  }

  /* ── Schnittansicht ────────────────────────────────────────────────────── */

  /** axis: 'x'|'y'|'z' (CAD-Achsen) oder null; t: 0..1 Position entlang der Achse. */
  setSection(axis, t = 0.5) {
    this.sectionAxis = axis;
    this.sectionT = t;
    if (!axis) {
      this.renderer.clippingPlanes = [];
      return;
    }
    const box = this._bbox();
    // Achsen in Weltkoordinaten (CAD X = Welt X, CAD Y ~ Welt Z, CAD Z = Welt Y)
    const map = {
      x: { a: new THREE.Vector3(1, 0, 0), min: box.min.x, max: box.max.x },
      y: { a: new THREE.Vector3(0, 0, 1), min: box.min.z, max: box.max.z },
      z: { a: new THREE.Vector3(0, 1, 0), min: box.min.y, max: box.max.y },
    };
    const { a, min, max } = map[axis];
    const pos = min + (max - min) * t;
    // geclippt wird alles jenseits von pos entlang der Achse
    this.renderer.clippingPlanes = [new THREE.Plane(a.clone().negate(), pos)];
    // dim: Modellausdehnung entlang der Achse, mm: Schnittabstand von der
    // Unterkante - beides fürs Eingabefeld im Schnitt-Panel.
    return { dim: max - min, mm: (max - min) * t };
  }

  /** Längste CAD-Achse des Modells (für sinnvolle Schnitt-Voreinstellung). */
  longestAxis() {
    const s = this._bbox().getSize(new THREE.Vector3());
    const dims = { x: s.x, y: s.z, z: s.y };
    return Object.entries(dims).sort((a, b) => b[1] - a[1])[0][0];
  }

  /* ── Explosionsansicht ─────────────────────────────────────────────────── */

  /** f: 0 (zusammengebaut) bis 1 (weit auseinander). */
  setExplode(f) {
    const parts = [];
    this.modelGroup.traverse((o) => {
      if (o.isMesh && o.userData.partIndex !== undefined) parts.push(o);
    });
    if (parts.length < 2) return false;
    if (!this._explodeBase) {
      const assembly = new THREE.Box3();
      const centers = parts.map((p) => {
        p.geometry.computeBoundingBox();
        const c = p.geometry.boundingBox.getCenter(new THREE.Vector3());
        assembly.expandByPoint(c);
        return c;
      });
      const center = assembly.getCenter(new THREE.Vector3());
      this._explodeBase = parts.map((p, i) => ({
        mesh: p,
        base: p.position.clone(),
        dir: centers[i].clone().sub(center),
      }));
    }
    for (const e of this._explodeBase) {
      e.mesh.position.copy(e.base).addScaledVector(e.dir, f * 0.9);
    }
    return true;
  }

  /* ── Export ────────────────────────────────────────────────────────────── */

  /** Liefert das Wurzelobjekt in CAD-Koordinaten (für STL-Export). */
  exportRoot() {
    return this.modelGroup.children[0] || null;
  }

  /** Hochauflösender Screenshot: rendert einmalig mit Faktor `scale`. */
  /** Pixelmaße, die ein Screenshot in dieser Auflösung hätte. */
  screenshotSize(scale = 3) {
    return { w: Math.round(this.container.clientWidth * scale), h: Math.round(this.container.clientHeight * scale) };
  }

  captureScreenshot(scale = 3) {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const prevRatio = this.renderer.getPixelRatio();
    // Pixelratio für die Aufnahme auf 1: das Bild soll genau w*scale × h*scale
    // groß werden. Auf Retina (Ratio 2) wäre der echte Puffer sonst doppelt so
    // groß und spränge bei 4x über das Canvas-Limit - toDataURL liefert dann
    // ein leeres Bild.
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w * scale, h * scale, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setPixelRatio(prevRatio);
    this.renderer.setSize(w, h);
    return dataUrl;
  }

  /** Abmessungen des Modells in Modelleinheiten (x/y/z im CAD-Koordinatensystem) */
  getDimensions() {
    const box = new THREE.Box3();
    // Bbox im lokalen (unrotierten) Raum der Modelldaten berechnen
    this.modelGroup.children.forEach((child) => {
      const b = new THREE.Box3().setFromObject(child);
      box.union(b);
    });
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    // modelGroup ist -90° um X gedreht: three-Y = CAD-Z, three-Z = CAD-Y
    return { x: size.x, y: size.z, z: size.y };
  }
}

function niceStep(raw) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  if (n < 1.5) return pow;
  if (n < 3.5) return 2 * pow;
  if (n < 7.5) return 5 * pow;
  return 10 * pow;
}

export { COLORS, THREE };

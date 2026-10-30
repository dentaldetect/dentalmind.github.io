// The 3D part of the dentition viewer: renderer, camera, controls, the GLB and its materials, picking,
// highlights and view presets. No UI text lives here; app.ts builds the interface around it.
//
// Anatomy (the GLB), selection (this file) and clinical status (app.ts, keyed by FDI) are kept apart: the
// model only provides one node per tooth, `tooth_<FDI>`, with its crown and root meshes as children.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Arch, Fdi } from './teeth';
import { ConditionLayer, type ConditionMap, type EvidenceKind } from './conditions';

export type ArchView = 'both' | 'upper' | 'lower';
export type Preset = 'default' | 'front' | 'right' | 'left' | 'upper' | 'lower';

export interface SceneCallbacks {
  onProgress?(fraction: number): void;
  /** Called after every rendered frame, e.g. to move labels. */
  onFrame?(): void;
  onContextLost?(): void;
  /** The user started dragging, zooming or panning the camera. */
  onCameraStart?(): void;
}

export interface Anchor {
  x: number;
  y: number;
  /** Unit vector (screen pixels) pointing away from the tooth, for placing a label beside it. */
  dx: number;
  dy: number;
  onScreen: boolean;
}

interface Tooth {
  fdi: Fdi;
  arch: Arch;
  group: THREE.Object3D;
  meshes: THREE.Mesh[];
  crown: THREE.Mesh;
  root: THREE.Mesh;
  uniforms: Uniforms[];
  tip: THREE.Vector3;
  cej: THREE.Vector3;
  axis: THREE.Vector3;
  facial: THREE.Vector3;
  outlines: THREE.Mesh[];
}

interface Uniforms {
  uEvidence: { value: number };
  uEvidenceColor: { value: THREE.Color };
  uHighlight: { value: number };
  uHighlightColor: { value: THREE.Color };
  uRim: { value: number };
  uRimColor: { value: THREE.Color };
}

const ACCENT = new THREE.Color('#0ba99a');
const HOVER_OUTLINE = new THREE.Color('#0d2547');
const DEG = Math.PI / 180;
// Camera directions (azimuth from the front towards the patient's left, elevation), degrees.
const PRESETS: Record<Preset, [number, number]> = {
  default: [-35, 14],
  front: [0, 4],
  right: [-90, 4],
  left: [90, 4],
  upper: [0, -88.5],
  lower: [0, 88.5],
};
const BITE_OPEN = 7 * DEG;

export class DentitionScene {
  readonly canvas: HTMLCanvasElement;
  readonly teeth = new Map<Fdi, Tooth>();
  readonly reducedMotion: boolean;
  readonly lowQuality: boolean;
  archView: ArchView = 'both';
  roots = false;
  biteOpen = true;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.005, 2);
  private controls: OrbitControls;
  private arches: Record<Arch, THREE.Object3D> = { upper: new THREE.Group(), lower: new THREE.Group() };
  private gums: THREE.Mesh[] = [];
  private gumMaterials: THREE.Material[] = [];
  private hinge = new THREE.Vector3();
  private biteAngle = BITE_OPEN;
  private hovered: Fdi | null = null;
  private selected: Fdi | null = null;
  private outlineMaterials: { hover: THREE.ShaderMaterial; select: THREE.ShaderMaterial };
  private lightTarget = new THREE.Object3D();
  private keyLight: THREE.DirectionalLight;
  private dirty = true;
  private tween: null | { t0: number; dur: number; update(k: number): void } = null;
  private raf = 0;
  private resizeObserver: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private disposed = false;
  private topInset = 0;
  private conditionLayer = new ConditionLayer();
  private framing: { preset: Preset } | { tooth: Fdi } | null = null;

  constructor(private host: HTMLElement, private callbacks: SceneCallbacks = {}) {
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dm3d-canvas';
    host.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.lowQuality = isLowEnd(this.renderer);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.lowQuality ? 1.25 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.callbacks.onContextLost?.();
    });

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // Studio rig that travels with the camera, so every view is lit the same way: a soft key from the upper
    // left, a cool fill from the right and a rim from behind; a hemisphere light adds sky/floor variation.
    this.scene.add(this.camera, this.lightTarget);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cfc6, 0.55));
    const key = new THREE.DirectionalLight(0xfff6ec, 1.55);
    key.position.set(-0.09, 0.12, 0.06);
    key.target = this.lightTarget;
    key.castShadow = !this.lowQuality;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -0.07;
    sc.right = sc.top = 0.07;
    sc.near = 0.01;
    sc.far = 0.5;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.00025;
    key.shadow.radius = 4;
    this.keyLight = key;
    const fill = new THREE.DirectionalLight(0xe8f1ff, 0.5);
    fill.position.set(0.12, 0.02, 0.05);
    fill.target = this.lightTarget;
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(0.02, 0.08, -0.12);
    rim.target = this.lightTarget;
    this.camera.add(key, fill, rim);

    this.scene.add(this.arches.upper, this.arches.lower);
    this.arches.upper.name = 'Maxilla';
    this.arches.lower.name = 'Mandible';

    // Widths in CSS pixels.
    this.outlineMaterials = { hover: outlineMaterial(HOVER_OUTLINE, 2.0, 0.6), select: outlineMaterial(ACCENT, 3.5, 1.0) };

    // OrbitControls must start with a nonzero eye-to-target vector, including when
    // a cached model finishes loading before the first animation frame.
    this.camera.position.set(0, 0.02, 0.2);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.dampingFactor = 0.09;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.045;
    this.controls.maxDistance = 0.42;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('change', () => {
      this.clampTarget();
      this.dirty = true;
    });
    this.controls.addEventListener('start', () => {
      this.tween = null;
      this.framing = null;
      this.callbacks.onCameraStart?.();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------------------------------- loading

  async load(url: string): Promise<void> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url, (e) => {
      if (e.lengthComputable && e.total) this.callbacks.onProgress?.(e.loaded / e.total);
    });
    const root = gltf.scene;
    const upper = root.getObjectByName('Maxilla');
    const lower = root.getObjectByName('Mandible');
    if (!upper || !lower) throw new Error('dentition model: Maxilla/Mandible nodes missing');
    for (const [arch, src] of [['upper', upper], ['lower', lower]] as const) {
      for (const child of [...src.children]) this.arches[arch].add(child);
    }

    const enamel = (fdi: string) => toothMaterial('enamel', this.lowQuality);
    for (const arch of ['upper', 'lower'] as const) {
      for (const node of this.arches[arch].children) {
        const m = /^tooth_([1-4][1-8])$/.exec(node.name);
        if (m) {
          const fdi = m[1] as Fdi;
          const crown = node.getObjectByName(`tooth_${fdi}_crown`) as THREE.Mesh | undefined;
          const root = node.getObjectByName(`tooth_${fdi}_root`) as THREE.Mesh | undefined;
          if (!crown || !root) throw new Error(`dentition model: tooth ${fdi} has no crown or root mesh`);
          const cm = enamel(fdi);
          const rm = toothMaterial('root', this.lowQuality);
          crown.material = cm.material;
          root.material = rm.material;
          const x = node.userData as { tip: number[]; cej: number[]; axis: number[]; facial: number[] };
          const t: Tooth = {
            fdi,
            arch,
            group: node,
            crown,
            root,
            meshes: [crown, root],
            uniforms: [cm.uniforms, rm.uniforms],
            tip: new THREE.Vector3(...x.tip),
            cej: new THREE.Vector3(...x.cej),
            axis: new THREE.Vector3(...x.axis),
            facial: new THREE.Vector3(...x.facial),
            outlines: [],
          };
          for (const mesh of t.meshes) {
            mesh.userData.fdi = fdi;
            mesh.castShadow = mesh.receiveShadow = !this.lowQuality;
          }
          root.visible = false;
          this.teeth.set(fdi, t);
        } else if (node.name.startsWith('gingiva_')) {
          const gum = node as THREE.Mesh;
          const g = toothMaterial('gingiva', this.lowQuality);
          gum.material = g.material;
          gum.receiveShadow = !this.lowQuality;
          gum.castShadow = false;
          gum.userData.gingiva = true;
          this.gums.push(gum);
          this.gumMaterials.push(g.material);
        }
      }
    }
    if (this.teeth.size !== 32) throw new Error(`dentition model: expected 32 teeth, found ${this.teeth.size}`);

    // Mandibular hinge: on the midline, 3 cm above the occlusal plane and 4 cm behind the last molars.
    const box = new THREE.Box3().setFromObject(this.arches.lower);
    this.hinge.set(0, 0.03, box.min.z - 0.04);
    this.applyBite(this.biteAngle);
    this.goTo('default', false);
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------------------- selection

  /** Selection colour (tint and outline), e.g. the page's brand accent. */
  setAccent(color: string): void {
    const c = new THREE.Color(color);
    for (const t of this.teeth.values()) for (const u of t.uniforms) u.uHighlightColor.value.copy(c);
    this.outlineMaterials.select.uniforms.uColor.value = c;
    this.dirty = true;
  }

  setHovered(fdi: Fdi | null): void {
    if (fdi === this.hovered) return;
    this.hovered = fdi;
    this.refreshHighlights();
  }

  setSelected(fdi: Fdi | null): void {
    if (fdi === this.selected) return;
    this.selected = fdi;
    this.refreshHighlights();
  }

  private refreshHighlights(): void {
    for (const t of this.teeth.values()) {
      const sel = t.fdi === this.selected;
      const hov = !sel && t.fdi === this.hovered;
      for (const u of t.uniforms) u.uHighlight.value = sel ? 0.22 : hov ? 0.07 : 0;
      const kind = sel ? 'select' : hov ? 'hover' : null;
      if (kind && !t.outlines.length) {
        t.outlines = t.meshes.map((m) => {
          const o = new THREE.Mesh(m.geometry, this.outlineMaterials.hover);
          o.renderOrder = -1;
          o.raycast = () => {};
          m.add(o);
          return o;
        });
      }
      t.outlines.forEach((o, i) => {
        o.geometry = t.meshes[i].geometry;
        o.visible = !!kind && t.meshes[i].visible;
        if (kind) o.material = this.outlineMaterials[kind];
      });
    }
    this.dirty = true;
  }

  /** The tooth under a screen point. Touch input also tries a ring of nearby points (fat-finger tolerance). */
  pick(clientX: number, clientY: number, touch = false): Fdi | null {
    const rect = this.canvas.getBoundingClientRect();
    const targets: THREE.Object3D[] = [];
    for (const t of this.teeth.values()) for (const m of t.meshes) if (m.visible && this.arches[t.arch].visible) targets.push(m);
    for (const g of this.gums) if (g.visible && g.parent?.visible && !(g.material as THREE.Material).transparent) targets.push(g);
    const ring = touch
      ? [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9], [7, 7], [-7, 7], [7, -7], [-7, -7], [16, 0], [-16, 0], [0, 16], [0, -16]]
      : [[0, 0]];
    for (const [ox, oy] of ring) {
      const ndc = new THREE.Vector2(((clientX + ox - rect.left) / rect.width) * 2 - 1, -((clientY + oy - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObjects(targets, false)[0];
      const fdi = hit?.object.userData.fdi as Fdi | undefined;
      if (fdi) return fdi;
    }
    return null;
  }

  // ------------------------------------------------------------------------------------------ display

  setArchView(view: ArchView): void {
    this.archView = view;
    this.arches.upper.visible = view !== 'lower';
    this.arches.lower.visible = view !== 'upper';
    this.refreshHighlights();
  }

  /** Anatomy mode: full teeth with roots, the gingiva reduced to a faint ghost. */
  setRoots(on: boolean): void {
    this.roots = on;
    for (const t of this.teeth.values()) t.root.visible = on;
    this.conditionLayer.setAnatomy(on);
    for (const m of this.gumMaterials) {
      m.transparent = on;
      m.opacity = on ? 0.14 : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
    for (const g of this.gums) {
      g.receiveShadow = !on && !this.lowQuality;
      g.renderOrder = on ? 2 : 0;
    }
    this.refreshHighlights();
  }

  setConditions(map: ConditionMap): void {
    this.conditionLayer.update(this.teeth, map);
    for (const t of this.teeth.values()) t.root.visible = this.roots;
    this.conditionLayer.setAnatomy(this.roots);
    this.refreshHighlights();
    this.dirty = true;
  }

  /** A review annotation, independently of illustrative damage geometry. */
  setEvidence(map: Partial<Record<Fdi, EvidenceKind>>): void {
    for (const [fdi, tooth] of this.teeth) {
      const kind = map[fdi];
      const color = kind === 'manual' ? '#9b6bc4' : kind === 'uncertain' ? '#6097bc' : '#e1a03d';
      for (const uniforms of tooth.uniforms) {
        uniforms.uEvidence.value = kind ? 0.38 : 0;
        uniforms.uEvidenceColor.value.set(color);
      }
    }
    this.dirty = true;
  }

  setBiteOpen(open: boolean, animate = true): void {
    this.biteOpen = open;
    const from = this.biteAngle;
    const to = open ? BITE_OPEN : 0;
    this.animate(animate ? 450 : 0, (k) => this.applyBite(from + (to - from) * k));
  }

  private applyBite(angle: number): void {
    this.biteAngle = angle;
    const g = this.arches.lower;
    g.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    g.position.copy(this.hinge).sub(this.hinge.clone().applyQuaternion(g.quaternion));
    g.updateMatrixWorld(true);
    this.dirty = true;
  }

  // ------------------------------------------------------------------------------------------- camera

  /** Move to a preset view. Occlusal presets look perpendicular to that arch's occlusal plane. */
  goTo(preset: Preset, animate = true): void {
    this.framing = { preset };
    const [az, el] = PRESETS[preset];
    const dir = new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));
    if (preset === 'upper' || preset === 'lower') dir.applyQuaternion(this.arches[preset].quaternion);
    const sphere = this.visibleSphere(preset);
    this.flyTo(sphere.center, dir, this.fitDistance(sphere.radius), animate);
  }

  focusTooth(fdi: Fdi, animate = true): void {
    const t = this.teeth.get(fdi);
    if (!t) return;
    this.framing = { tooth: fdi };
    const m = this.arches[t.arch].matrixWorld;
    const tip = t.tip.clone().applyMatrix4(m);
    const cej = t.cej.clone().applyMatrix4(m);
    const facial = t.facial.clone().transformDirection(m);
    const axis = t.axis.clone().transformDirection(m);
    const target = tip.clone().lerp(cej, 0.45);
    const dir = facial.multiplyScalar(0.85).add(axis.multiplyScalar(0.45)).normalize();
    this.flyTo(target, dir, 0.075, animate);
  }

  orbitBy(dAzimuth: number, dElevation: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(offset);
    s.theta += dAzimuth;
    s.phi = THREE.MathUtils.clamp(s.phi - dElevation, 0.02, Math.PI - 0.02);
    this.flyTo(this.controls.target.clone(), new THREE.Vector3().setFromSpherical(s).normalize(), s.radius, true, 180);
  }

  zoomBy(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const d = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.flyTo(this.controls.target.clone(), offset.normalize(), d, true, 180);
  }

  private flyTo(target: THREE.Vector3, dir: THREE.Vector3, distance: number, animate: boolean, ms = 650): void {
    const t0 = this.controls.target.clone();
    const off0 = this.camera.position.clone().sub(t0);
    // A collapsed camera can otherwise stay at its target through every preset.
    if (!Number.isFinite(off0.lengthSq()) || off0.lengthSq() < 1e-12) off0.set(0, 0, distance);
    const d0 = off0.length();
    const q = new THREE.Quaternion().setFromUnitVectors(off0.clone().normalize(), dir.clone().normalize());
    const id = new THREE.Quaternion();
    const qk = new THREE.Quaternion();
    this.animate(animate ? ms : 0, (k) => {
      qk.slerpQuaternions(id, q, k);
      const off = off0.clone().normalize().applyQuaternion(qk).multiplyScalar(d0 + (distance - d0) * k);
      this.controls.target.lerpVectors(t0, target, k);
      this.camera.position.copy(this.controls.target).add(off);
      this.camera.lookAt(this.controls.target);
      this.controls.update();
    });
  }

  private animate(ms: number, update: (k: number) => void): void {
    if (ms <= 0 || this.reducedMotion) {
      this.tween = null;
      update(1);
      this.dirty = true;
      return;
    }
    this.tween = { t0: performance.now(), dur: ms, update };
  }

  /** Bounding sphere of what a preset shows (one arch for the occlusal views), slightly tightened. */
  private visibleSphere(preset: Preset): THREE.Sphere {
    const only = preset === 'upper' || preset === 'lower' ? this.arches[preset] : null;
    const box = new THREE.Box3();
    for (const a of [this.arches.upper, this.arches.lower]) a.updateMatrixWorld(true);
    for (const t of this.teeth.values()) if (!only || t.arch === preset) box.expandByObject(t.crown);
    for (const g of this.gums) if (!only || g.parent === only) box.expandByObject(g);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    sphere.radius *= 0.9;
    return sphere;
  }

  /** Camera distance at which a sphere fits the visible part of the canvas (below the toolbar inset). */
  private fitDistance(radius: number): number {
    const h = Math.max(1, this.host.clientHeight);
    const inset = Math.min(Math.max(0, this.topInset), h * 0.35);
    const full = h + inset;
    const tanFull = Math.tan((this.camera.fov * DEG) / 2);
    const tanV = (tanFull * (h - inset)) / full;
    const tanH = tanFull * this.camera.aspect;
    const half = Math.atan(Math.min(tanV, tanH));
    return THREE.MathUtils.clamp(radius / Math.sin(half), this.controls.minDistance, this.controls.maxDistance);
  }

  private clampTarget(): void {
    const t = this.controls.target;
    t.x = THREE.MathUtils.clamp(t.x, -0.04, 0.04);
    t.y = THREE.MathUtils.clamp(t.y, -0.035, 0.035);
    t.z = THREE.MathUtils.clamp(t.z, -0.05, 0.04);
  }

  // ------------------------------------------------------------------------------------ screen helpers

  /** Screen position (CSS px, relative to the canvas) of a tooth's crown tip and the outward direction. */
  anchor(fdi: Fdi): Anchor | null {
    const t = this.teeth.get(fdi);
    if (!t || !this.arches[t.arch].visible) return null;
    const m = this.arches[t.arch].matrixWorld;
    const tip = t.tip.clone().applyMatrix4(m);
    const out = t.tip.clone().addScaledVector(t.facial, 0.004).addScaledVector(t.axis, 0.004).applyMatrix4(m);
    const a = this.toScreen(tip);
    const b = this.toScreen(out);
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return { x: a.x, y: a.y, dx, dy, onScreen: a.z < 1 && a.x >= 0 && a.y >= 0 && a.x <= w && a.y <= h };
  }

  /** Screen point (CSS px, relative to the canvas) on the crown, between the tip and the CEJ. */
  crownPoint(fdi: Fdi, t = 0.3): { x: number; y: number } | null {
    const tooth = this.teeth.get(fdi);
    if (!tooth) return null;
    const p = tooth.tip.clone().lerp(tooth.cej, t).applyMatrix4(this.arches[tooth.arch].matrixWorld);
    const s = this.toScreen(p);
    return { x: s.x, y: s.y };
  }

  /** Screen rectangle (CSS px, relative to the canvas) around everything visible: the projected corners of
   *  the visible arches' bounding boxes. Conservative (a box is larger than the silhouette). */
  screenBounds(): { left: number; top: number; right: number; bottom: number } | null {
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    for (const a of [this.arches.upper, this.arches.lower]) {
      if (!a.visible) continue;
      a.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.union(part.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld));
      });
    }
    if (box.isEmpty()) return null;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const p = this.toScreen(c);
      if (p.z > 1) return null; // a corner behind the camera: no meaningful rectangle
      left = Math.min(left, p.x);
      right = Math.max(right, p.x);
      top = Math.min(top, p.y);
      bottom = Math.max(bottom, p.y);
    }
    return { left, top, right, bottom };
  }

  /** Screen direction of the patient's left (+X), normalised; `side` says which side faces the camera. */
  orientation(): { dx: number; dy: number; flat: number; side: 'left' | 'right' | null } {
    const o = this.toScreen(this.controls.target);
    const l = this.toScreen(this.controls.target.clone().add(new THREE.Vector3(0.03, 0, 0)));
    const dx = l.x - o.x;
    const dy = l.y - o.y;
    const len = Math.hypot(dx, dy);
    const scale = (this.canvas.clientHeight + this.topInset) / (2 * Math.tan((this.camera.fov * DEG) / 2) * this.camera.position.distanceTo(this.controls.target));
    const flat = len / (0.03 * scale); // 1 when the left-right axis lies in the screen plane, 0 end-on
    const camX = this.camera.position.x - this.controls.target.x;
    return { dx: dx / (len || 1), dy: dy / (len || 1), flat, side: flat < 0.45 ? (camX > 0 ? 'left' : 'right') : null };
  }

  private toScreen(v: THREE.Vector3): THREE.Vector3 {
    const p = v.clone().project(this.camera);
    return new THREE.Vector3(((p.x + 1) / 2) * this.canvas.clientWidth, ((1 - p.y) / 2) * this.canvas.clientHeight, p.z);
  }

  // ------------------------------------------------------------------------------------- render loop

  /** Pixels at the top covered by the toolbar: the camera's centre moves down by half of it. */
  setTopInset(px: number): void {
    if (px === this.topInset) return;
    this.topInset = px;
    this.resize();
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    const inset = Math.min(Math.max(0, this.topInset), h * 0.35);
    this.renderer.setSize(w, h, false);
    // A taller virtual frame with the canvas at its top puts the optical centre `topInset / 2` lower
    // (the aspect is the virtual frame's, so pixels stay square).
    this.camera.aspect = w / (h + inset);
    if (inset > 0) this.camera.setViewOffset(w, h + inset, 0, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    for (const m of Object.values(this.outlineMaterials)) m.uniforms.uResolution.value.set(w, h);
    // Panel/container changes can occur after a hidden tab has loaded. Refit the
    // current subject; preserve a camera the user has manually orbited or panned.
    if (this.teeth.size && this.framing) {
      if ('preset' in this.framing) this.goTo(this.framing.preset, false);
      else this.focusTooth(this.framing.tooth, false);
    }
    this.dirty = true;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.t0) / this.tween.dur);
      const tw = this.tween;
      tw.update(easeInOut(k));
      if (k >= 1 && this.tween === tw) this.tween = null;
      this.dirty = true;
    }
    if (this.controls.update()) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.lightTarget.position.copy(this.controls.target);
    this.renderer.render(this.scene, this.camera);
    this.callbacks.onFrame?.();
  };

  invalidate(): void {
    this.dirty = true;
  }

  dispose(): void {
    this.conditionLayer.clear();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}

// -------------------------------------------------------------------------------------------- materials

type Kind = 'enamel' | 'root' | 'gingiva';

/** PBR material with two additions in the shader: an accent highlight that tints but keeps the shading, and
 *  a soft rim term that stands in for light scattering through enamel and gingiva. */
function toothMaterial(kind: Kind, low: boolean): { material: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial; uniforms: Uniforms } {
  const uniforms: Uniforms = {
    uEvidence: { value: 0 },
    uEvidenceColor: { value: new THREE.Color('#e1a03d') },
    uHighlight: { value: 0 },
    uHighlightColor: { value: ACCENT.clone() },
    uRim: { value: kind === 'enamel' ? 0.16 : kind === 'gingiva' ? 0.12 : 0.05 },
    uRimColor: { value: new THREE.Color(kind === 'gingiva' ? '#ff8f86' : '#fff1d6') },
  };
  const common = { vertexColors: true, metalness: 0 };
  let material: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial;
  if (low) {
    material = new THREE.MeshStandardMaterial({ ...common, roughness: kind === 'enamel' ? 0.34 : kind === 'root' ? 0.62 : 0.5 });
  } else if (kind === 'enamel') {
    material = new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.3, clearcoat: 0.45, clearcoatRoughness: 0.3, specularIntensity: 0.55, ior: 1.6 });
  } else if (kind === 'root') {
    material = new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.62, specularIntensity: 0.35 });
  } else {
    material = new THREE.MeshPhysicalMaterial({
      ...common,
      roughness: 0.46,
      clearcoat: 0.35,
      clearcoatRoughness: 0.42,
      sheen: 0.45,
      sheenColor: new THREE.Color('#ffc9c2'),
      sheenRoughness: 0.55,
      specularIntensity: 0.45,
    });
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader =
      'uniform float uEvidence;\nuniform vec3 uEvidenceColor;\nuniform float uHighlight;\nuniform vec3 uHighlightColor;\nuniform float uRim;\nuniform vec3 uRimColor;\n' +
      shader.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, uEvidenceColor, uEvidence);\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, uHighlightColor, uHighlight );')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n\tfloat dmRim = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 3.0 );\n\ttotalEmissiveRadiance += uRimColor * dmRim * uRim * diffuseColor.rgb + uHighlightColor * uHighlight * 0.22;',
        );
  };
  material.customProgramCacheKey = () => `dm-${kind}-${low ? 'lo' : 'hi'}`;
  return { material, uniforms };
}

/** Back-face hull pushed out along the normals in screen space: a constant-width outline in pixels. */
function outlineMaterial(color: THREE.Color, widthPx: number, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uWidth: { value: widthPx }, uResolution: { value: new THREE.Vector2(1, 1) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      uniform vec2 uResolution;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
        float l = length(dir);
        if (l > 1e-5) clip.xy += dir / l * uWidth * 2.0 / uResolution * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() { gl_FragColor = vec4(uColor, uOpacity); }`,
    side: THREE.BackSide,
    transparent: opacity < 1,
    depthWrite: false,
  });
}

function easeInOut(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** Software renderers (an emulator, a GPU blocklist) and small touch devices get the cheaper path. */
function isLowEnd(renderer: THREE.WebGLRenderer): boolean {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'low') return true;
  if (q === 'high') return false;
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|software/i.test(name)) return true;
  return (navigator.hardwareConcurrency ?? 8) <= 4;
}

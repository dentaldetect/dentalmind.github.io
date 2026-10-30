// Illustrative condition geometry. No surface coordinate or severity is inferred here.
import * as THREE from 'three';
import type { Fdi } from './teeth';

export const CONDITION_LABELS = {
  caries: 'Caries', fracture: 'Chipped / fractured crown', periapical: 'Periapical finding',
  restoration: 'Restoration', root_canal: 'Root canal treated', missing: 'Missing tooth',
} as const;
export type ConditionKind = keyof typeof CONDITION_LABELS;
export type Condition = { kind: ConditionKind; origin: 'ai' | 'manual'; uncertain?: boolean };
export type ConditionMap = Partial<Record<Fdi, Condition[]>>;
export type EvidenceKind = 'positive' | 'uncertain' | 'manual';
export interface ConditionTooth {
  group: THREE.Object3D; crown: THREE.Mesh; root: THREE.Mesh;
  tip: THREE.Vector3; cej: THREE.Vector3; axis: THREE.Vector3; facial: THREE.Vector3;
}

export function kindForCode(code: string): ConditionKind | null {
  return ({ caries: 'caries', deep_caries: 'caries', periapical_lesion: 'periapical',
    restoration: 'restoration', crown: 'restoration', root_canal_treated: 'root_canal' } as Record<string, ConditionKind>)[code] ?? null;
}

function surface(t: ConditionTooth) {
  t.group.updateWorldMatrix(true, true);
  const center = new THREE.Box3().setFromObject(t.crown).getCenter(new THREE.Vector3());
  const direction = t.facial.clone().addScaledVector(t.axis, 0.45).normalize().transformDirection(t.group.matrixWorld);
  const ray = new THREE.Raycaster(center.clone().addScaledVector(direction, 0.04), direction.clone().negate());
  const hit = ray.intersectObject(t.crown, false)[0];
  const inverse = t.group.matrixWorld.clone().invert();
  const point = (hit?.point ?? center).clone().applyMatrix4(inverse);
  const normal = hit?.face
    ? hit.face.normal.clone().transformDirection(t.crown.matrixWorld).transformDirection(inverse)
    : t.facial.clone();
  return { point, normal };
}

function patch(t: ConditionTooth, kind: 'caries' | 'restoration') {
  const { point, normal } = surface(t);
  const geometry = new THREE.SphereGeometry(kind === 'caries' ? 0.0024 : 0.0033, 24, 16);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const ripple = kind === 'caries' ? 1 + 0.12 * Math.sin(Math.atan2(y, x) * 7) : 1;
    positions.setXYZ(i, x * ripple, y * ripple * 0.8, z * 0.16);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: kind === 'caries' ? '#38231b' : '#aebac1',
    roughness: kind === 'caries' ? 0.92 : 0.24, metalness: kind === 'caries' ? 0 : 0.65 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(point).addScaledVector(normal, 0.00015);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return mesh;
}

export function rootEndpoints(t: ConditionTooth) {
  const center = t.cej.clone();
  const positions = t.root.geometry.attributes.position;
  let apex = center.clone(), furthest = 0;
  t.root.updateMatrix();
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(t.root.matrix);
    const depth = center.clone().sub(p).dot(t.axis);
    if (depth > furthest) { furthest = depth; apex = p; }
  }
  return { center, apex };
}

export class ConditionLayer {
  private cleanup: Array<() => void> = [];
  private anatomy = false;
  private internalEffects: THREE.Group[] = [];

  setAnatomy(on: boolean) {
    this.anatomy = on;
    for (const group of this.internalEffects) group.visible = on;
  }

  clear() {
    for (const dispose of this.cleanup.splice(0)) dispose();
    this.internalEffects = [];
  }

  update(teeth: Map<Fdi, ConditionTooth>, map: ConditionMap) {
    this.clear();
    for (const [fdi, conditions] of Object.entries(map)) {
      const t = teeth.get(fdi as Fdi);
      if (!t || !conditions?.length) continue;
      const effects = new THREE.Group();
      effects.name = 'illustrative_conditions';
      effects.userData.schematic = true;
      t.group.add(effects);
      this.cleanup.push(() => {
        effects.removeFromParent();
        effects.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      });
      const kinds = new Set(conditions.map(c => c.kind));
      if (kinds.has('missing')) {
        for (const mesh of [t.crown, t.root]) {
          const original = mesh.material as THREE.Material;
          const ghost = original.clone(); ghost.transparent = true; ghost.opacity = 0.12; ghost.depthWrite = false;
          mesh.material = ghost;
          this.cleanup.push(() => { mesh.material = original; ghost.dispose(); });
        }
        continue;
      }
      if (kinds.has('caries')) effects.add(patch(t, 'caries'));
      if (kinds.has('restoration')) effects.add(patch(t, 'restoration'));
      if (kinds.has('fracture')) {
        const original = t.crown.geometry;
        const chipped = original.clone();
        const positions = chipped.attributes.position;
        const normal = t.axis.clone().add(t.facial).normalize();
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, i).dot(normal);
          min = Math.min(min, p); max = Math.max(max, p);
        }
        const plane = min + (max - min) * 0.72;
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, i);
          const excess = p.dot(normal) - plane;
          if (excess > 0) p.addScaledVector(normal, -excess);
          positions.setXYZ(i, p.x, p.y, p.z);
        }
        positions.needsUpdate = true; chipped.computeVertexNormals();
        t.crown.geometry = chipped;
        this.cleanup.push(() => { t.crown.geometry = original; chipped.dispose(); });
      }
      if (kinds.has('root_canal') || kinds.has('periapical')) {
        // Internal illustrations never expose roots in the normal surface view.
        const internal = new THREE.Group();
        internal.name = 'anatomy_only_conditions';
        internal.visible = this.anatomy;
        effects.add(internal);
        this.internalEffects.push(internal);
        const { center, apex } = rootEndpoints(t);
        if (kinds.has('root_canal')) {
          const curve = new THREE.CatmullRomCurve3([center, center.clone().lerp(apex, 0.5), apex]);
          const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.00055, 8, false),
            new THREE.MeshBasicMaterial({ color: '#f7a01c', depthTest: false, transparent: true, opacity: 0.85 }));
          line.renderOrder = 4; internal.add(line);
        }
        if (kinds.has('periapical')) {
          const halo = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 24, 16),
            new THREE.MeshBasicMaterial({ color: '#dc5f42', transparent: true, opacity: 0.3, depthWrite: false }));
          halo.position.copy(apex); internal.add(halo);
        }
      }
    }
  }
}

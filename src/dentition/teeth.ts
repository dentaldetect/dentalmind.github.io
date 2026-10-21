// Tooth metadata for the dentition viewer. The mapping itself is generated with the model
// (tools/dentition/build_dentition.py -> public/models/dentition/teeth.json) so the GLB node names, the
// numbers and the names can never disagree.
import data from '../../public/models/dentition/teeth.json';

/** FDI two-digit tooth number ('11'..'48'), the identifier used everywhere (contract v1 `Fdi`). */
export type Fdi = `${1 | 2 | 3 | 4}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type Arch = 'upper' | 'lower';
export type Side = 'left' | 'right';
export type ToothType =
  | 'central_incisor'
  | 'lateral_incisor'
  | 'canine'
  | 'first_premolar'
  | 'second_premolar'
  | 'first_molar'
  | 'second_molar'
  | 'third_molar';

export interface ToothInfo {
  fdi: Fdi;
  /** Universal (ADA) number: 1 = upper right third molar … 16 = upper left third molar, 17 … 32 lower left to right. */
  universal: number;
  quadrant: 1 | 2 | 3 | 4;
  position: number;
  type: ToothType;
  arch: Arch;
  /** The patient's side. */
  side: Side;
  name: { en: string; fa: string };
  /** 'placeholder': approximated geometry (the third molars), see public/models/dentition/LICENSE.md. */
  geometry: 'bodyparts3d' | 'placeholder';
  source: string;
  node: string;
}

export const TEETH = data.teeth as ToothInfo[];
export const BY_FDI = new Map<Fdi, ToothInfo>(TEETH.map((t) => [t.fdi, t]));

/** Dental-chart order of each arch, from the patient's right to the patient's left. */
export const CHART: Record<Arch, Fdi[]> = {
  upper: ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'],
  lower: ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'],
};

export const isFdi = (s: string): s is Fdi => BY_FDI.has(s as Fdi);

export type Numbering = 'fdi' | 'universal';

export const toothNumber = (fdi: Fdi, numbering: Numbering): string =>
  numbering === 'fdi' ? fdi : String(BY_FDI.get(fdi)!.universal);

/** The tooth on the other side of the arch (`dir` +1 towards the patient's left) or in the opposing arch. */
export function neighbour(fdi: Fdi, move: 'left' | 'right' | 'opposite' | 'first' | 'last'): Fdi {
  const t = BY_FDI.get(fdi)!;
  const row = CHART[t.arch];
  const i = row.indexOf(fdi);
  switch (move) {
    case 'left':
      return row[Math.min(i + 1, row.length - 1)];
    case 'right':
      return row[Math.max(i - 1, 0)];
    case 'first':
      return row[0];
    case 'last':
      return row[row.length - 1];
    case 'opposite':
      return CHART[t.arch === 'upper' ? 'lower' : 'upper'][i];
  }
}

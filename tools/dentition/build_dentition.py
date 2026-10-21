"""Build the DentalMind 3D dentition (GLB) and its tooth metadata from BodyParts3D.

    python build_dentition.py      # writes build/dentition.raw.glb and ../../public/models/dentition/teeth.json
    node compress.mjs              # build/dentition.raw.glb -> ../../public/models/dentition/dentition.glb

Input: source/BodyParts3D_Tooth.stl, the 28 permanent teeth of BodyParts3D 4.3 (DBCLS, CC BY-SA 2.1 JP),
one closed mesh per tooth, in the BodyParts3D frame (mm; +x patient left, +y posterior, +z superior).

Output (glTF frame: metres, +X patient left, +Y up, +Z anterior, i.e. towards a viewer facing the patient;
the occlusal plane is levelled and lies at Y = 0, the dental midline at X = 0):
  build/dentition.raw.glb  nodes  Dentition > Maxilla | Mandible > tooth_<FDI> > tooth_<FDI>_crown, tooth_<FDI>_root,
                     plus gingiva_upper / gingiva_lower. Every tooth node carries its metadata in `extras`.
                     (compress.mjs turns it into the web asset dentition.glb.)
  teeth.json         the tooth metadata mapping (FDI, Universal, names, arch, side, provenance)

What is measured and what is generated:
  * teeth 11-17, 21-27, 31-37, 41-47: BodyParts3D meshes, re-oriented, subdivided and lightly smoothed, then
    split at an estimated cemento-enamel junction (CEJ) into crown and root. Not reshaped.
  * teeth 18, 28, 38, 48 (third molars): PLACEHOLDERS. BodyParts3D has no third molars; each one is the second
    molar of its quadrant scaled to Wheeler's average third-molar size, with converging roots.
  * gingiva: GENERATED soft tissue (an implicit surface around the teeth, cut at a scalloped gingival margin),
    not anatomical data.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage import measure

from anatomy import FMA, WHEELER, tooth_record

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'source' / 'BodyParts3D_Tooth.stl'
DEFAULT_OUT = HERE.parent.parent / 'public' / 'models' / 'dentition'
RAW_OUT = HERE / 'build'

# BodyParts3D frame -> glTF frame (a rotation; mm -> m happens at export).
BP_TO_GL = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, -1.0, 0.0]])
UP = np.array([0.0, 1.0, 0.0])

# Chart order of each arch, patient right to patient left.
ORDER = {
    'upper': ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'],
    'lower': ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'],
}

# Gingival margin above the facial CEJ, and height of the interdental papilla above the facial margin, mm.
MARGIN_ABOVE_CEJ = 1.0
PAPILLA = {1: 3.6, 2: 3.4, 3: 3.0, 4: 2.6, 5: 2.4, 6: 2.0, 7: 1.8, 8: 1.6}
# Crown/root split below the facial CEJ (always hidden under the gingiva), mm.
SPLIT_BELOW_CEJ = 1.6


def arch_of(fdi: str) -> str:
    return 'upper' if fdi[0] in '12' else 'lower'


def affine(r: np.ndarray, t: np.ndarray | None = None) -> np.ndarray:
    m = np.eye(4)
    m[:3, :3] = r
    if t is not None:
        m[:3, 3] = t
    return m


def rotation(axis: np.ndarray, angle: float) -> np.ndarray:
    axis = axis / np.linalg.norm(axis)
    k = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + np.sin(angle) * k + (1 - np.cos(angle)) * (k @ k)


# ---------------------------------------------------------------------------------------------- loading


def load_teeth() -> dict[str, trimesh.Trimesh]:
    """The 28 BodyParts3D teeth keyed by FDI number, in the glTF frame (still mm)."""
    raw = trimesh.load(SOURCE, force='mesh')
    parts = [p for p in raw.split(only_watertight=False) if len(p.faces) >= 200]
    if len(parts) != 28:
        raise SystemExit(f'expected 28 teeth in {SOURCE.name}, found {len(parts)}')
    for p in parts:
        p.apply_transform(affine(BP_TO_GL))

    # Upper and lower arch: the crowns interdigitate, so split at the largest gap in centroid height.
    ys = np.sort([p.centroid[1] for p in parts])
    gap = int(np.argmax(np.diff(ys)))
    split = (ys[gap] + ys[gap + 1]) / 2
    teeth: dict[str, trimesh.Trimesh] = {}
    for arch in ('upper', 'lower'):
        members = [p for p in parts if (p.centroid[1] > split) == (arch == 'upper')]
        if len(members) != 14:
            raise SystemExit(f'{arch} arch: expected 14 teeth, found {len(members)}')
        # Side from x (+X is the patient's left); position from the angle around a point behind the arch:
        # smallest angle = central incisor, largest = second molar.
        back_z = min(p.centroid[2] for p in members)
        mid_x = float(np.mean([p.centroid[0] for p in members]))
        for side in ('right', 'left'):
            group = [p for p in members if (p.centroid[0] > mid_x) == (side == 'left')]
            if len(group) != 7:
                raise SystemExit(f'{arch} {side}: expected 7 teeth, found {len(group)}')
            group.sort(key=lambda p: np.arctan2(abs(p.centroid[0] - mid_x), p.centroid[2] - back_z + 1e-6))
            quadrant = {('upper', 'right'): 1, ('upper', 'left'): 2, ('lower', 'left'): 3, ('lower', 'right'): 4}[(arch, side)]
            for i, p in enumerate(group):
                teeth[f'{quadrant}{i + 1}'] = p
    return teeth


def long_axis(mesh: trimesh.Trimesh, arch: str) -> tuple[np.ndarray, np.ndarray]:
    """Area-weighted centroid and principal axis, pointing from the apex to the crown."""
    v = mesh.vertices
    w = np.zeros(len(v))
    np.add.at(w, mesh.faces.ravel(), np.repeat(mesh.area_faces / 3, 3))
    c = (v * w[:, None]).sum(0) / w.sum()
    cov = ((v - c) * w[:, None]).T @ (v - c) / w.sum()
    axis = np.linalg.eigh(cov)[1][:, -1]
    occlusal = -UP if arch == 'upper' else UP
    return c, (axis if axis @ occlusal > 0 else -axis)


def level_and_center(teeth: dict[str, trimesh.Trimesh]) -> None:
    """Rotate so the occlusal plane (incisal point of 11/21, cusp tips of 16 and 26) is horizontal, then put
    the dental midline at X = 0 and the occlusal plane at Y = 0."""

    def tip(f: str) -> np.ndarray:
        m = teeth[f]
        c, a = long_axis(m, arch_of(f))
        return m.vertices[np.argmax((m.vertices - c) @ a)]

    incisal = (tip('11') + tip('21')) / 2
    molars = (tip('16') + tip('26')) / 2
    # Pitch: incisal point and the molar midpoint at the same height.
    d = incisal - molars
    pitch = np.arctan2(d[1], d[2])
    r = rotation(np.array([1.0, 0.0, 0.0]), pitch)
    # Roll: 16 and 26 at the same height.
    d = r @ (tip('26') - tip('16'))
    roll = -np.arctan2(d[1], d[0])
    r = rotation(np.array([0.0, 0.0, 1.0]), roll) @ r
    for m in teeth.values():
        m.apply_transform(affine(r))
    upper_tips = np.array([tip(f) for f in ('11', '21', '16', '26')])
    lower_tips = np.array([tip(f) for f in ('31', '41', '36', '46')])
    origin = np.array([
        (tip('11')[0] + tip('21')[0]) / 2,
        (upper_tips[:, 1].mean() + lower_tips[:, 1].mean()) / 2,
        0.0,
    ])
    zs = np.concatenate([m.vertices[:, 2] for m in teeth.values()])
    origin[2] = (zs.min() + zs.max()) / 2
    for m in teeth.values():
        m.apply_translation(-origin)


def refine(mesh: trimesh.Trimesh, subdivisions: int) -> trimesh.Trimesh:
    """Interpolating subdivision: every source vertex stays where it is, each new edge midpoint is placed on
    the curved (PN-triangle) edge implied by the vertex normals. Rounds the facets of the source
    triangulation without shrinking the tooth (the caller checks the volume)."""
    mesh = trimesh.Trimesh(mesh.vertices.copy(), mesh.faces.copy(), process=True)
    mesh.merge_vertices()
    for _ in range(subdivisions):
        v, n, e = mesh.vertices, mesh.vertex_normals, mesh.edges_unique
        pi, pj, ni, nj = v[e[:, 0]], v[e[:, 1]], n[e[:, 0]], n[e[:, 1]]
        wij = ((pj - pi) * ni).sum(1)[:, None]
        wji = ((pi - pj) * nj).sum(1)[:, None]
        mid = (pi + pj) / 2 - (wij * ni + wji * nj) / 8
        f, fe = mesh.faces, mesh.faces_unique_edges + len(v)
        faces = np.concatenate([
            np.stack([f[:, 0], fe[:, 0], fe[:, 2]], 1),
            np.stack([fe[:, 0], f[:, 1], fe[:, 1]], 1),
            np.stack([fe[:, 2], fe[:, 1], f[:, 2]], 1),
            fe,
        ])
        mesh = trimesh.Trimesh(np.vstack([v, mid]), faces, process=True)
    return mesh


# --------------------------------------------------------------------------------------- tooth frames


class Frame:
    """Landmarks of one tooth (glTF frame, mm): long axis, CEJ, tip, facial and mesial directions."""

    def __init__(self, fdi: str, mesh: trimesh.Trimesh):
        self.fdi = fdi
        self.arch = arch_of(fdi)
        self.position = int(fdi[1])
        self.center, self.axis = long_axis(mesh, self.arch)
        t = (mesh.vertices - self.center) @ self.axis
        self.length = float(t.max() - t.min())
        ref = WHEELER[self.arch][self.position]
        self.crown_fraction = ref['crown'] / (ref['crown'] + ref['root'])
        self.cej = self.center + self.axis * (t.max() - self.crown_fraction * self.length)
        self.tip = self.center + self.axis * t.max()
        self.apex = self.center + self.axis * t.min()
        self.cervical_curve = ref['cervical']
        self.facial = np.zeros(3)
        self.mesial = np.zeros(3)

    def set_directions(self, mesial: np.ndarray, facial_hint: np.ndarray) -> None:
        m = mesial - self.axis * (mesial @ self.axis)
        self.mesial = m / np.linalg.norm(m)
        f = np.cross(self.axis, self.mesial)
        self.facial = f if f @ facial_hint > 0 else -f

    def local(self, pts: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Height above the facial CEJ along the axis, and the facial / mesial components."""
        d = pts - self.cej
        return d @ self.axis, d @ self.facial, d @ self.mesial

    def cej_height(self, pts: np.ndarray) -> np.ndarray:
        """Height of the (scalloped) cervical line at the angular position of each point: on the facial and
        lingual surfaces it is at the facial CEJ, on the proximal surfaces it rises by the cervical curvature."""
        _, f, m = self.local(pts)
        prox = np.abs(m) / np.maximum(np.hypot(f, m), 1e-6)
        return self.cervical_curve * prox**2

    def margin_height(self, pts: np.ndarray) -> np.ndarray:
        """Height of the gingival margin above the facial CEJ: scalloped, with papillae between the teeth."""
        _, f, m = self.local(pts)
        prox = np.abs(m) / np.maximum(np.hypot(f, m), 1e-6)
        return MARGIN_ABOVE_CEJ + PAPILLA[self.position] * prox**3

    def info(self) -> dict:
        mm = lambda v: [round(float(x) / 1000, 5) for x in v]  # noqa: E731
        unit = lambda v: [round(float(x), 4) for x in v]  # noqa: E731
        return {'tip': mm(self.tip), 'cej': mm(self.cej), 'apex': mm(self.apex), 'axis': unit(self.axis), 'facial': unit(self.facial)}


def arch_directions(frames: dict[str, Frame]) -> None:
    """Mesial and facial directions from the arch curve through the CEJ centres."""
    for arch, order in ORDER.items():
        present = [f for f in order if f in frames]
        pts = np.array([frames[f].cej for f in present])
        centroid = pts.mean(0)
        for i, f in enumerate(present):
            a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
            tangent = b - a  # towards the patient's left
            # Mesial points towards the midline: for right-side teeth that is towards the patient's left.
            mesial = tangent if f[0] in '14' else -tangent
            hint = frames[f].cej - centroid
            hint[1] = 0
            frames[f].set_directions(mesial, hint)


# ------------------------------------------------------------------------------- third-molar placeholders


def third_molar(fdi: str, second: trimesh.Trimesh, fr: Frame, rng: np.random.Generator) -> trimesh.Trimesh:
    """PLACEHOLDER third molar: the second molar of the same quadrant, scaled in its own frame to Wheeler's
    average third/second-molar proportions, with the occlusal relief softened and the roots converging (third
    molar roots are often fused). Tilted the usual way (upper: distal and buccal; lower: mesial and lingual)
    and placed distal to the second molar with a contact."""
    arch = fr.arch
    w2, w3 = WHEELER[arch][7], WHEELER[arch][8]
    m = second.copy()
    v = m.vertices - fr.cej
    h, f, ms = v @ fr.axis, v @ fr.facial, v @ fr.mesial
    s_md, s_bl = w3['md'] / w2['md'], w3['bl'] / w2['bl']
    s_crown, s_root = w3['crown'] / w2['crown'], w3['root'] / w2['root']
    crown_len = (fr.tip - fr.cej) @ fr.axis
    root_len = (fr.cej - fr.apex) @ fr.axis
    h_new = np.where(h > 0, h * s_crown, h * s_root)
    depth = np.clip(-h / root_len, 0, 1)
    converge = 1 - 0.45 * depth**1.3
    f_new, m_new = f * s_bl * converge, ms * s_md * converge
    m.vertices = fr.cej + np.outer(h_new, fr.axis) + np.outer(f_new, fr.facial) + np.outer(m_new, fr.mesial)
    # Softer occlusal relief: Laplacian smoothing of the occlusal half of the crown only.
    occ = np.where(h_new > 0.45 * crown_len * s_crown)[0]
    nb = m.vertex_neighbors
    verts = m.vertices.copy()
    for _ in range(4):
        avg = np.array([verts[nb[i]].mean(0) for i in occ])
        verts[occ] = verts[occ] * 0.6 + avg * 0.4
    m.vertices = verts
    # Tilt the crown (degrees, relative to the second molar): upper distally and buccally, lower mesially
    # and lingually.
    mesial_tilt, facial_tilt = (-7.0, 4.0) if arch == 'upper' else (6.0, -5.0)
    target = fr.axis + fr.mesial * np.tan(np.radians(mesial_tilt)) + fr.facial * np.tan(np.radians(facial_tilt))
    target /= np.linalg.norm(target)
    r = rotation(np.cross(fr.axis, target), np.arccos(np.clip(fr.axis @ target, -1, 1)))
    m.vertices = (m.vertices - fr.cej) @ r.T + fr.cej
    # Place it distal to the second molar, a little up the curve of Spee, then close the contact.
    distal = -fr.mesial
    lift = (0.4 if arch == 'lower' else -0.4)
    m.vertices = m.vertices + distal * (w2['md'] + w3['md']) * 0.55 * fr.length / (w2['crown'] + w2['root']) + UP * lift
    crown2 = second.vertices[((second.vertices - fr.cej) @ fr.axis) > 0]
    tree = cKDTree(crown2)
    for _ in range(80):
        crown3 = m.vertices[((m.vertices - fr.cej) @ fr.axis) > 0]
        d, _ = tree.query(crown3)
        inside = second.contains(crown3[d < 1.5]) if np.any(d < 1.5) else np.array([], bool)
        gap = d.min()
        if inside.any() or gap < 0.15:
            m.vertices = m.vertices + distal * 0.1
        elif gap > 0.35:
            m.vertices = m.vertices - distal * 0.05
        else:
            break
    return m


# --------------------------------------------------------------------------------------------- gingiva


def smax(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    h = np.clip(k - np.abs(a - b), 0, None) / k
    return np.maximum(a, b) + h * h * k * 0.25


def gingiva(arch: str, teeth: dict[str, trimesh.Trimesh], frames: dict[str, Frame], pitch: float = 0.25) -> trimesh.Trimesh:
    """GENERATED gingiva for one arch: the set of points close to the teeth below a scalloped gingival margin,
    thinning to a knife edge at the margin, with a smooth base; extracted with marching cubes."""
    fdis = [f for f in ORDER[arch] if f in teeth]
    allv = np.concatenate([teeth[f].vertices for f in fdis])
    lo, hi = allv.min(0) - 5.0, allv.max(0) + 5.0
    shape = np.ceil((hi - lo) / pitch).astype(int) + 1
    occ = np.zeros(shape, bool)
    lab = np.full(shape, -1, np.int8)
    for i, f in enumerate(fdis):
        vg = teeth[f].voxelized(pitch).fill()
        idx = np.round((vg.points - lo) / pitch).astype(int)
        idx = idx[np.all((idx >= 0) & (idx < shape), axis=1)]
        occ[tuple(idx.T)] = True
        lab[tuple(idx.T)] = i
    near = np.zeros((3,) + tuple(shape), np.int32)
    d_out = ndimage.distance_transform_edt(~occ, sampling=pitch, return_indices=True, indices=near)
    d_in = ndimage.distance_transform_edt(occ, sampling=pitch)
    dist = (d_out - d_in).astype(np.float32)
    nearest = lab[near[0], near[1], near[2]]
    del near

    grid = np.stack(np.meshgrid(*[lo[k] + pitch * np.arange(shape[k]) for k in range(3)], indexing='ij'), -1).astype(np.float32)
    field = np.full(shape, 50.0, np.float32)
    depth_below_margin = np.zeros(shape, np.float32)
    for i, f in enumerate(fdis):
        mask = nearest == i
        p = grid[mask]
        fr = frames[f]
        h, fac, mes = fr.local(p)
        delta = fr.margin_height(p) - h  # > 0 below the margin
        lingual = np.clip(-fac / np.maximum(np.hypot(fac, mes), 1e-6), 0, 1)
        # Facial tissue over the roots is thin; lingual (palatal) tissue thicker.
        r_max = 1.6 + 1.2 * lingual
        radius = np.clip(0.12 + 0.5 * delta, 0.12, r_max)
        f_env = dist[mask] - radius
        field[mask] = smax(f_env, -delta, 0.35)
        depth_below_margin[mask] = delta
    # Base: a level cut, `depth` mm beyond the deepest margin, with a generous rounding.
    margins_y = np.array([frames[f].cej[1] for f in fdis])
    depth = 7.0
    y = grid[..., 1]
    cap = (y - (margins_y.max() + depth)) if arch == 'upper' else ((margins_y.min() - depth) - y)
    field = smax(field, cap.astype(np.float32), 2.0)
    del grid, y, cap
    # Crisp near the margin, much smoother deeper down (no sausage-like bulges over every root).
    sharp = ndimage.gaussian_filter(field, sigma=0.4 / pitch)
    soft = ndimage.gaussian_filter(field, sigma=1.3 / pitch)
    w = np.clip((depth_below_margin - 2.0) / 3.0, 0, 1)
    field = sharp * (1 - w) + soft * w
    del sharp, soft, w, depth_below_margin

    verts, faces, _, _ = measure.marching_cubes(field, level=0.0, spacing=(pitch,) * 3)
    mesh = trimesh.Trimesh(verts + lo, faces, process=True)
    mesh = max(mesh.split(only_watertight=False), key=lambda m: len(m.faces))
    if mesh.volume < 0:
        mesh.invert()
    trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=10)
    v, fc = fast_simplification.simplify(mesh.vertices, mesh.faces, target_reduction=1 - 26000 / len(mesh.faces))
    mesh = trimesh.Trimesh(v, fc, process=True)
    if mesh.volume < 0:
        mesh.invert()
    return mesh


# ----------------------------------------------------------------------------------------------- colours


def mix(a, b, t):
    t = np.clip(t, 0, 1)[:, None]
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


def srgb(hex_color: str) -> np.ndarray:
    return np.array([int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)])


ENAMEL_INCISAL = srgb('#e9ebe6')  # thin enamel over the incisal edge: greyer, slightly cool
ENAMEL_BODY = srgb('#f1eadb')
ENAMEL_CERVICAL = srgb('#e6d6b6')  # dentine shows through the thin cervical enamel
ROOT = srgb('#dcc7a1')
ROOT_APEX = srgb('#c9ad84')
GUM_MARGIN = srgb('#e7a7a4')
GUM_BODY = srgb('#dc8f90')
GUM_DEEP = srgb('#c97378')


def tooth_colors(mesh: trimesh.Trimesh, fr: Frame, neighbours: list[trimesh.Trimesh]) -> np.ndarray:
    v = mesh.vertices
    h, _, _ = fr.local(v)
    crown_len = (fr.tip - fr.cej) @ fr.axis
    root_len = (fr.cej - fr.apex) @ fr.axis
    cej = fr.cej_height(v)
    above = h - cej
    s = above / crown_len
    enamel = mix(ENAMEL_CERVICAL, ENAMEL_BODY, s / 0.4)
    if fr.position <= 3:
        enamel = mix(enamel, ENAMEL_INCISAL, (s - 0.75) / 0.25 * 0.8)
    root = mix(ROOT, ROOT_APEX, -above / root_len)
    col = mix(root, enamel, (above + 0.25) / 0.5)
    # Ambient occlusion near the contact areas with the neighbouring teeth.
    ao = np.ones(len(v))
    for n in neighbours:
        d, _ = cKDTree(n.vertices).query(v, distance_upper_bound=3.0)
        d = np.where(np.isinf(d), 3.0, d)
        ao = np.minimum(ao, 0.78 + 0.22 * np.clip(d / 2.2, 0, 1))
    return np.clip(col * ao[:, None], 0, 1)


def gum_colors(mesh: trimesh.Trimesh, frames: list[Frame]) -> np.ndarray:
    v = mesh.vertices
    best = np.full(len(v), np.inf)
    delta = np.zeros(len(v))
    for fr in frames:
        d = np.linalg.norm(np.cross(v - fr.cej, fr.axis), axis=1)
        h, _, _ = fr.local(v)
        closer = d < best
        best[closer] = d[closer]
        delta[closer] = (fr.margin_height(v) - h)[closer]
    col = mix(GUM_MARGIN, GUM_BODY, delta / 2.5)
    col = mix(col, GUM_DEEP, (delta - 4.0) / 4.0)
    return np.clip(col, 0, 1)


# ------------------------------------------------------------------------------------------- glTF export


class Gltf:
    """Minimal glTF 2.0 binary writer: meshes with POSITION / NORMAL / COLOR_0 and named nodes."""

    def __init__(self):
        self.doc = {'asset': {'version': '2.0', 'generator': 'DentalMind build_dentition.py'}, 'scene': 0, 'scenes': [{'nodes': []}],
                    'nodes': [], 'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': []}
        self.bin = bytearray()

    def _view(self, data: bytes, target: int | None) -> int:
        while len(self.bin) % 4:
            self.bin.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            view['target'] = target
        self.bin.extend(data)
        self.doc['bufferViews'].append(view)
        return len(self.doc['bufferViews']) - 1

    def _accessor(self, arr: np.ndarray, ctype: int, atype: str, target: int, normalized=False, minmax=False) -> int:
        acc = {'bufferView': self._view(arr.tobytes(), target), 'componentType': ctype, 'count': int(arr.shape[0]), 'type': atype}
        if normalized:
            acc['normalized'] = True
        if minmax:
            acc['min'] = [float(x) for x in arr.min(0)]
            acc['max'] = [float(x) for x in arr.max(0)]
        self.doc['accessors'].append(acc)
        return len(self.doc['accessors']) - 1

    def material(self, name: str, color, roughness: float, extras: dict | None = None) -> int:
        mat = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': list(color) + [1.0], 'metallicFactor': 0.0, 'roughnessFactor': roughness}}
        if extras:
            mat['extras'] = extras
        self.doc['materials'].append(mat)
        return len(self.doc['materials']) - 1

    def mesh(self, name: str, mesh: trimesh.Trimesh, colors: np.ndarray, material: int, normals: np.ndarray | None = None) -> int:
        pos = (mesh.vertices / 1000.0).astype(np.float32)
        nrm = (normals if normals is not None else mesh.vertex_normals).astype(np.float32)
        nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
        # COLOR_0 is linear in glTF; the palette above is sRGB.
        lin = np.where(colors <= 0.04045, colors / 12.92, ((colors + 0.055) / 1.055) ** 2.4)
        col = np.concatenate([np.round(lin * 255), np.full((len(colors), 1), 255)], 1).astype(np.uint8)
        idx = mesh.faces.astype(np.uint16 if len(pos) < 65536 else np.uint32).ravel()
        prim = {
            'attributes': {
                'POSITION': self._accessor(pos, 5126, 'VEC3', 34962, minmax=True),
                'NORMAL': self._accessor(nrm, 5126, 'VEC3', 34962),
                'COLOR_0': self._accessor(col, 5121, 'VEC4', 34962, normalized=True),
            },
            'indices': self._accessor(idx, 5123 if idx.dtype == np.uint16 else 5125, 'SCALAR', 34963),
            'material': material,
        }
        self.doc['meshes'].append({'name': name, 'primitives': [prim]})
        return len(self.doc['meshes']) - 1

    def node(self, name: str, mesh: int | None = None, children: list[int] | None = None, extras: dict | None = None) -> int:
        n = {'name': name}
        if mesh is not None:
            n['mesh'] = mesh
        if children:
            n['children'] = children
        if extras:
            n['extras'] = extras
        self.doc['nodes'].append(n)
        return len(self.doc['nodes']) - 1

    def write(self, path: Path, root: int) -> None:
        self.doc['scenes'][0]['nodes'] = [root]
        while len(self.bin) % 4:
            self.bin.append(0)
        self.doc['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(self.doc, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        js += b' ' * ((4 - len(js) % 4) % 4)
        with open(path, 'wb') as fh:
            fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin)))
            fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            fh.write(struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin))


def split_crown_root(mesh: trimesh.Trimesh, fr: Frame) -> tuple[trimesh.Trimesh, trimesh.Trimesh, np.ndarray, np.ndarray]:
    """Split along existing edges (by face centroid height) so the two halves share their boundary vertices
    and normals: no seam when both are shown."""
    normals = mesh.vertex_normals.copy()
    h, _, _ = fr.local(mesh.triangles_center)
    crown_faces = h > -SPLIT_BELOW_CEJ
    out = []
    for keep in (crown_faces, ~crown_faces):
        faces = mesh.faces[keep]
        used = np.unique(faces)
        remap = np.full(len(mesh.vertices), -1)
        remap[used] = np.arange(len(used))
        out.append((trimesh.Trimesh(mesh.vertices[used], remap[faces], process=False), used))
    (crown, cu), (root, ru) = out
    return crown, root, normals[cu], normals[ru]


# ------------------------------------------------------------------------------------------------ main


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, default=DEFAULT_OUT)
    ap.add_argument('--subdivisions', type=int, default=1)
    ap.add_argument('--pitch', type=float, default=0.25, help='gingiva voxel size, mm')
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    teeth = load_teeth()
    level_and_center(teeth)
    for f in list(teeth):
        before = teeth[f].volume
        teeth[f] = refine(teeth[f], args.subdivisions)
        change = abs(teeth[f].volume / before - 1)
        if change > 0.03:
            raise SystemExit(f'{f}: smoothing changed the volume by {change:.1%}')
    frames = {f: Frame(f, m) for f, m in teeth.items()}
    arch_directions(frames)

    rng = np.random.default_rng(7)
    placeholders = {'18': '17', '28': '27', '38': '37', '48': '47'}
    for third, second in placeholders.items():
        teeth[third] = third_molar(third, teeth[second], frames[second], rng)
        frames[third] = Frame(third, teeth[third])
    arch_directions(frames)

    gltf = Gltf()
    # Base colour white: the vertex colours (COLOR_0) carry the enamel, root and gingiva shades.
    mat_enamel = gltf.material('enamel', (1.0, 1.0, 1.0), 0.38)
    mat_root = gltf.material('root', (1.0, 1.0, 1.0), 0.62)
    mat_gum = gltf.material('gingiva', (1.0, 1.0, 1.0), 0.5, extras={'generated': True})

    records = []
    arch_nodes = {}
    for arch in ('upper', 'lower'):
        children = []
        for f in ORDER[arch]:
            mesh, fr = teeth[f], frames[f]
            i = ORDER[arch].index(f)
            neighbours = [teeth[n] for n in ORDER[arch][max(i - 1, 0):i + 2] if n != f]
            colors = tooth_colors(mesh, fr, neighbours)
            crown, root, n_crown, n_root = split_crown_root(mesh, fr)
            c_idx = np.unique(mesh.faces[fr.local(mesh.triangles_center)[0] > -SPLIT_BELOW_CEJ])
            r_idx = np.unique(mesh.faces[fr.local(mesh.triangles_center)[0] <= -SPLIT_BELOW_CEJ])
            rec = tooth_record(f)
            rec['geometry'] = 'placeholder' if f in placeholders else 'bodyparts3d'
            rec['source'] = (f'PLACEHOLDER: BodyParts3D {FMA[placeholders[f]]} (tooth {placeholders[f]}) scaled to Wheeler third-molar averages'
                             if f in placeholders else f'BodyParts3D 4.3 {FMA[f]}')
            rec['node'] = f'tooth_{f}'
            records.append(rec)
            extras = {k: rec[k] for k in ('fdi', 'universal', 'type', 'arch', 'side', 'geometry')} | fr.info()
            kids = [
                gltf.node(f'tooth_{f}_crown', gltf.mesh(f'tooth_{f}_crown', crown, colors[c_idx], mat_enamel, n_crown)),
                gltf.node(f'tooth_{f}_root', gltf.mesh(f'tooth_{f}_root', root, colors[r_idx], mat_root, n_root)),
            ]
            children.append(gltf.node(f'tooth_{f}', children=kids, extras=extras))
            print(f'{f}  {rec["geometry"]:11s} crown {len(crown.faces):5d} root {len(root.faces):5d} faces  len {fr.length:4.1f} mm')
        gum = gingiva(arch, teeth, frames, args.pitch)
        gum_col = gum_colors(gum, [frames[f] for f in ORDER[arch]])
        children.append(gltf.node(f'gingiva_{arch}', gltf.mesh(f'gingiva_{arch}', gum, gum_col, mat_gum), extras={'generated': True}))
        print(f'gingiva_{arch}: {len(gum.faces)} faces, watertight={gum.is_watertight}')
        arch_nodes[arch] = gltf.node('Maxilla' if arch == 'upper' else 'Mandible', children=children, extras={'arch': arch})

    root = gltf.node('Dentition', children=[arch_nodes['upper'], arch_nodes['lower']], extras={
        'license': 'CC BY-SA 2.1 JP',
        'attribution': 'BodyParts3D, (c) The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan',
        'placeholders': sorted(placeholders),
        'generated': ['gingiva_upper', 'gingiva_lower'],
        'units': 'metres; +X patient left, +Y up, +Z anterior',
    })
    RAW_OUT.mkdir(exist_ok=True)
    gltf.write(RAW_OUT / 'dentition.raw.glb', root)
    records.sort(key=lambda r: (r['quadrant'], r['position']))
    (args.out / 'teeth.json').write_text(json.dumps({
        'version': 1,
        'numbering': 'FDI two-digit (ISO 3950), as in DentalMind contract v1; Universal (ADA) given for display',
        'teeth': records,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('wrote', RAW_OUT / 'dentition.raw.glb', (RAW_OUT / 'dentition.raw.glb').stat().st_size // 1024, 'KiB')


if __name__ == '__main__':
    main()

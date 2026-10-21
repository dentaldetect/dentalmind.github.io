# DentalMind 3D dentition: provenance and licence

`dentition.glb` (and `teeth.json`, its tooth metadata) are built by `tools/dentition/build_dentition.py` from
**BodyParts3D**, © The Database Center for Life Science (DBCLS), licensed under
[Creative Commons Attribution-Share Alike 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en)
(CC BY-SA 2.1 JP).

- Source file: `BodyParts3D_Tooth.stl` (BodyParts3D 4.3, representation BP22611, FMA12516 "tooth"), from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:BodyParts3D_Tooth.stl);
  SHA-256 `523892a8d6bac7becdf9569d853a199797006836faafab10a3595b7b84d72055`.
- Project: [BodyParts3D / Anatomography](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html).

**Licence of this derivative.** `dentition.glb` and `teeth.json` are adaptations of
BodyParts3D and are distributed under the same licence, **CC BY-SA 2.1 JP**. When you reuse them, credit
"BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP; adapted by DentalMind" and share your
adaptations under the same licence. The viewer code that displays the model (`src/dentition/`) is not part of
this licence.

## What is anatomical data and what is not

| Part | Origin | Status |
|---|---|---|
| Teeth 11–17, 21–27, 31–37, 41–47 | BodyParts3D meshes (one per tooth, crown and root), FMA ids in `teeth.json` | Anatomical source data. Re-oriented (occlusal plane levelled), refined with an interpolating subdivision that keeps every source vertex, split into crown and root at an estimated cemento-enamel junction. Not reshaped. Left and right teeth in the source are near-mirror images. |
| Teeth 18, 28, 38, 48 (third molars) | **Placeholder.** BodyParts3D has no third molars. Each is the second molar of the same quadrant, scaled to average third/second-molar proportions (Wheeler's Dental Anatomy tables), with softened occlusal relief and converging roots, tilted and placed distal to the second molar. | Approximation. Marked `"geometry": "placeholder"` in `teeth.json` and in the GLB node extras, and shown as "approximated shape" in the viewer. |
| Gingiva (`gingiva_upper`, `gingiva_lower`) | **Generated** implicit surface around the teeth, cut at a scalloped margin about 1 mm above the estimated CEJ with interdental papillae. | Illustration, not measured tissue. Node extras `"generated": true`. |
| Crown/root boundary, enamel and root colours | Estimated from average crown/root length ratios per tooth type (Wheeler) | Approximation for display. |

**Missing asset:** an openly licensed, anatomically accurate model of the four permanent third molars (and,
ideally, a full dentition scanned from one subject with natural left/right differences). Candidates checked and
not used: Teeth3DS+ (CC BY-NC-ND, crowns only), Open-Full-Jaw (CC BY-NC-SA), NIH 3D 3DPX-003002 (one upper cast),
commercial marketplace models (no compatible licence). Replacing the placeholders only needs new meshes in
`tools/dentition/source/` and a re-run of the build; node names and FDI numbers stay the same.

## Coordinate frame and node names

Metres; +X patient's left, +Y up, +Z anterior (towards a viewer facing the patient); the occlusal plane is
levelled at Y = 0 and the dental midline is at X = 0.

`Dentition > Maxilla | Mandible > tooth_<FDI> > tooth_<FDI>_crown, tooth_<FDI>_root`, plus `gingiva_upper`
under Maxilla and `gingiva_lower` under Mandible. Each `tooth_<FDI>` node carries `extras`: `fdi`, `universal`,
`type`, `arch`, `side` (the patient's), `geometry`, and the landmarks `tip`, `cej`, `apex` (points) and `axis`,
`facial` (unit vectors) in its arch's frame.

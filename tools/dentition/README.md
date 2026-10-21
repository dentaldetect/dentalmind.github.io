# 3D tooth atlas: model, metadata and viewer

An interactive 3D model of the 32 permanent teeth, used on the website (`/dentition/`) and in the Android
app (Settings → 3D tooth atlas for dentists, the 3D teeth tool for patients).

| Piece | Where |
|---|---|
| Source anatomy | `source/BodyParts3D_Tooth.stl` (BodyParts3D 4.3, DBCLS, CC BY-SA 2.1 JP) |
| Model pipeline | `build_dentition.py` (+ `anatomy.py`), `compress.mjs` |
| Web asset | `public/models/dentition/dentition.glb` (1.8 MB, meshopt) |
| Tooth metadata | `public/models/dentition/teeth.json` (FDI, Universal, EN/FA names, arch, patient side, provenance) |
| Provenance and licence | `public/models/dentition/LICENSE.md` |
| Viewer | `src/dentition/` — `scene.ts` (three.js), `app.ts` (interface), `teeth.ts` (metadata), `dentition.css` |
| Website page | `src/pages/[...lang]/dentition.astro`, component `src/components/DentitionViewer.astro` |
| App bundle | `npm run build:dentition-embed` → `dist-embed/`, copied to the Android app's `core/ui/src/main/assets/dentition/` |

## Honest status of the geometry

- **Teeth 11–17, 21–27, 31–37, 41–47:** BodyParts3D meshes, oriented and smoothed, not reshaped.
- **Third molars 18, 28, 38, 48: placeholder geometry.** No openly licensed third-molar model was found;
  each is the same-side second molar resized to average third-molar proportions. Flagged
  `"geometry": "placeholder"` in `teeth.json`, marked "≈" in the chart and explained in the tooth details.
- **Gingiva: generated** around the teeth (not measured tissue).
- **Missing asset:** an openly licensed, anatomically accurate set of permanent third molars (ideally a whole
  dentition from one subject). Drop new meshes into `source/`, re-run the build; names and IDs stay the same.

## Rebuild the model

```bash
python -m venv .venv && .venv/Scripts/pip install -r tools/dentition/requirements.txt
.venv/Scripts/python tools/dentition/build_dentition.py   # writes build/dentition.raw.glb and teeth.json
npm run model:dentition                                     # compresses into public/models/dentition/dentition.glb
```

## Use the viewer

Every tooth is the GLB node `tooth_<FDI>` (children `tooth_<FDI>_crown`, `tooth_<FDI>_root`) with its metadata
in `extras`; FDI numbers are strings `"11"`…`"48"`, as in DentalMind contract v1 (`Fdi`).

```ts
import { mountDentition } from '../dentition/app';
const viewer = mountDentition(element, { lang: 'en', strings, modelUrl, licenseUrl });
viewer.select('36', /* zoom to it */ true);
viewer.setNumbering('universal');
// Clinical status stays separate from the anatomy: by FDI number, shown in the chart and tooth details.
viewer.setStatus({ '36': { level: 'act', items: ['Deep caries (awaiting dentist review)'] } });
element.addEventListener('dentition:select', (e) => console.log(e.detail.fdi));
```

On the website page, `?tooth=36` opens with that tooth selected. The embed bundle reads
`index.html?lang=fa&theme=dark&tooth=36` and reports selections to `window.DentalMindAndroid.onSelect(fdi)`.

## Interaction

Drag to rotate, scroll or pinch to zoom, right-drag or two fingers to pan; a tap (moves less than a few pixels)
selects, a drag never does; touch taps tolerate a near miss. Reset view; presets front, patient's right,
patient's left, upper occlusal (from below) and lower occlusal (from above); arches both / upper / lower;
roots (anatomy mode: roots shown, gingiva as a faint ghost); open/closed bite; FDI or Universal numbering.
Keyboard: arrows move between teeth (Up/Down to the opposing arch), Enter zooms, Escape clears, +/− zoom,
Shift+arrows rotate, R resets, 1–5 choose a view. The 32-tooth chart is the accessible alternative to
picking in 3D. Reduced motion turns off camera animation and damping. Without WebGL the chart and details
still work.

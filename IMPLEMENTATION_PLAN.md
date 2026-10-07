# Implementation plan: dentalmind.github.io

The product and research site for DentalMind, an AI second reader for panoramic dental
X-rays. Its structure follows hellopearl.com: an audience menu, product pages, a "request a
demo" button, value cards, social proof and a resources footer. DentalMind adds two things
Pearl doesn't have: a **public evidence page** and an **in-browser demo**.

---

## 0. Constraints that shape every decision

| Constraint | Consequence |
|---|---|
| Hosted on **GitHub Pages** (static only) | No backend. The demo must run the model **in the browser** (ONNX Runtime Web) and forms go to a third-party endpoint. |
| Repo is `dentaldetect/dentalmind.github.io`, a **project site** | Served at `https://dentaldetect.github.io/dentalmind.github.io/`. Set `base` accordingly, or rename the repo to `dentaldetect.github.io` or add a custom domain later. |
| Medical AI, **not a cleared device** | Never claim FDA or Iran FDA (سازمان غذا و دارو) clearance. Every page that shows output says "research prototype, decision support only: the dentist decides". |
| Numbers must be real | Value cards and the evidence page read metrics from one JSON file exported by the training/eval code. No invented statistics ("37% more disease"-style claims) and no invented testimonials. |
| Patient privacy | The demo runs locally; images never leave the browser. Still warn users to upload only de-identified images. |

## 1. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Astro** (static) with a few interactive islands | Fast marketing pages; same stack as IranianHealthcare.github.io, so components can be shared. |
| Styling | **Tailwind CSS** with logical properties | One codebase works for English (LTR) and Persian (RTL). |
| Languages | **English (default, `/`) + Persian (`/fa/`)** via Astro i18n routing | English for researchers and evidence; Persian for Iranian dentists. Flip the default if the main audience is local. |
| Fonts | Inter + Vazirmatn, self-hosted | No external font requests (they're slow or blocked in Iran). |
| Demo inference | **onnxruntime-web** (WASM, WebGPU when available) in a **Web Worker** | Runs on the client, keeps data private, no server cost. |
| Demo UI | Canvas overlay + small framework island (Preact or Svelte) | Draw boxes, toggle classes, hover for details. |
| Report export | Print stylesheet (`window.print()` → PDF) | Handles Persian text shaping correctly; jsPDF handles Persian poorly. |
| Forms | Formspree (or Google Forms) | Demo requests and contact without a backend. |
| Analytics | GoatCounter | Light and privacy-friendly. |
| Deploy | GitHub Actions → Pages | |

## 2. Repository structure

```
/
├─ .github/workflows/deploy.yml
├─ public/
│  ├─ models/dentalmind-detect.onnx     # quantised; keep < 50 MB (GitHub hard limit is 100 MB/file, and LFS files are not served by Pages)
│  ├─ samples/                          # de-identified sample panoramics, with licence noted
│  └─ og/                               # social preview images
├─ src/
│  ├─ content/
│  │  ├─ blog/  (en/, fa/)
│  │  ├─ glossary/
│  │  └─ faq/
│  ├─ data/
│  │  ├─ metrics.json                   # exported from the training repo's eval script, the only source of numbers
│  │  └─ classes.json                   # class ids, names (en/fa), colours
│  ├─ i18n/ (en.json, fa.json)
│  ├─ components/
│  ├─ demo/
│  │  ├─ worker.ts                      # load ONNX, preprocess, infer, postprocess
│  │  ├─ preprocess.ts                  # resize/letterbox, normalise
│  │  ├─ postprocess.ts                 # decode, NMS, map boxes back to image coordinates
│  │  ├─ quality.ts                     # image-quality gate
│  │  └─ DemoApp.tsx
│  ├─ layouts/
│  └─ pages/ (and pages/fa/)
└─ astro.config.mjs
```

## 3. Pages

| Route | Purpose | Key blocks |
|---|---|---|
| `/` | Home | Hero (pitch + animated panoramic with AI boxes), 3-step "how it works", product cards, value cards fed from `metrics.json`, evidence teaser, audience tiles, CTA band |
| `/product/detect/` | **DentalMind Detect** | The 4 finding classes with example crops, FDI tooth numbering, confidence display |
| `/product/quality/` | **Quality Check** | Why rejecting bad images matters; examples of rejected images |
| `/product/report/` | **Report** | Tooth chart, findings table, printable patient/dentist report |
| `/for/dentists/`, `/for/clinics/`, `/for/universities/` | Audience pages (like Pearl's Dentists/DSOs/Universities) | Pain points → features → CTA |
| `/evidence/` | **Validation** | Datasets, metrics with 95% CIs, per-class table, confusion matrix, operating-point explanation, limits and intended use, failure examples |
| `/demo/` | **Interactive demo** | Upload or pick a sample → quality gate → detections → tooth chart → print report |
| `/request-demo/` | Lead form | Name, clinic, city, role, chairs, message |
| `/blog/`, `/blog/[slug]/` | Articles | Shared tags with IranianHealthcare.github.io's dentistry section |
| `/glossary/` | Dental terms (SEO) | |
| `/faq/` | Privacy, accuracy, regulatory status, pricing | |
| `/about/` | Team, research background, contact | |
| `/privacy/`, `/terms/`, `/404` | | |

## 4. The demo, in detail

```
image file ──► quality.ts ──► worker.ts (ONNX) ──► postprocess.ts ──► canvas overlay + tooth chart + report
                 │ reject with reason
                 ▼
          "Image unusable: too dark / blurry / not a panoramic"
```

1. **Input:** drag-and-drop or one of 4-6 sample images. Decode with `createImageBitmap`.
2. **Quality gate (v1, rules):** minimum resolution, panoramic aspect ratio (~2:1),
   exposure histogram, blur via Laplacian variance. v2 swaps in a learned quality model,
   the same idea as the DR project's quality stage.
3. **Inference:** in a Web Worker so the page stays responsive; WebGPU if available, otherwise
   WASM. Show a progress state. The model is fetched once and cached.
4. **Postprocess:** score threshold set to the **sensitivity-first operating point** stored in
   `metrics.json`, then NMS and mapping back to original pixel coordinates.
5. **Output:** colour-coded boxes per class with show/hide toggles; hover shows class, tooth
   (FDI) and confidence; a findings table; an FDI tooth chart with affected teeth highlighted.
6. **Report:** print view with image, findings, tooth chart, model version, date and disclaimer.
7. **Never:** upload, store or log images. State this next to the upload box.

**Model work needed in the training repo before this:**
- [ ] Train the detector on DENTEX (hierarchical labels: quadrant → tooth number → diagnosis)
- [ ] Export to ONNX (opset ≥ 17), quantise to int8 or fp16, check output matches PyTorch on a held-out set
- [ ] Export `metrics.json`: per-class sensitivity, specificity, AP, CIs, operating threshold, dataset/split names, model version, date
- [ ] Check the licence of every sample image and dataset used on the site (DENTEX's licence and attribution terms) and attribute them on `/evidence/`

## 5. Components

`Header` (audience menu, Product menu, Evidence, Learn, About, language switch, **Request a
demo** button) · `Footer` · `Hero` · `HowItWorks` · `ProductCard` · `ValueCard` (renders
"Validation in progress" when the metric is missing; never a placeholder number) ·
`AudienceTile` · `EvidenceTable` · `ConfusionMatrix` · `CTABand` · `DemoApp` ·
`ToothChart` (FDI) · `FindingsTable` · `Disclaimer` · `LanguageSwitch` · `LeadForm` · `FAQ`

## 6. Phases

### Phase 0: Setup
- [ ] Scaffold Astro + Tailwind + TypeScript; set `site`/`base`; i18n routing (`en` default, `fa`)
- [ ] Self-hosted fonts; `dir` switches by locale
- [ ] `deploy.yml` builds and publishes to Pages

**Done when:** `/` and `/fa/` are live with the correct direction and fonts.

### Phase 1: Landing page (first public version)
- [ ] Design tokens (clinical palette, light/dark), header, footer
- [ ] Home: hero, how it works, product cards, CTA
- [ ] `/request-demo/` with a working form
- [ ] `/about/`, `/privacy/`, `/terms/`, disclaimer on every page

**Done when:** the home page works at 360 / 768 / 1280 px and a test form submission arrives.

### Phase 2: Product and audience pages
- [ ] `/product/detect|quality|report/`, with real example images
- [ ] `/for/dentists|clinics|universities/`
- [ ] All copy in English and Persian

### Phase 3: Evidence
- [ ] `metrics.json` schema plus a build-time check; the build fails if a number shown on a page isn't in the file
- [ ] `/evidence/` page with tables, CIs, confusion matrix, intended use, limits, failure cases
- [ ] Value cards on the home page fed from the same file

### Phase 4: Interactive demo
- [ ] Worker + ONNX loading + preprocessing/postprocessing (§4)
- [ ] Rule-based quality gate
- [ ] Overlay, class toggles, findings table, FDI tooth chart
- [ ] Print report
- [ ] Test on low-end Android Chrome: model download size, time to first result (target < 5 s after model load)
- [ ] Check that a browser sample and the Python pipeline give the same boxes (±1 px, same classes)

### Phase 5: Content and SEO
- [ ] Blog (en/fa), glossary, FAQ
- [ ] Sitemap, `hreflang` en/fa, Open Graph images, JSON-LD (`SoftwareApplication`, `FAQPage`, `Organization`)
- [ ] Cross-links with IranianHealthcare.github.io's dentistry section

### Phase 6: Later
- [ ] Learned quality model in the demo
- [ ] Case studies and testimonials from real pilot clinics (with written consent)
- [ ] Teaching mode for students (like Pearl's Calibrate)
- [ ] Custom domain + `CNAME`

## 7. Open decisions
1. Default language: English or Persian?
2. Which detector architecture to export (YOLO-family is easiest for ONNX in the browser)?
3. Where to host the model if it exceeds ~50 MB (GitHub Release asset vs. external storage reachable from Iran)?
4. Form endpoint: Formspree, Google Forms, or plain `mailto:`?

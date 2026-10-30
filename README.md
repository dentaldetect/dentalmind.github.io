# dentalmind.github.io

Product and research website for **DentalMind**, an AI second reader for dental X-rays: tooth numbering
(FDI), findings (caries, deep caries, periapical lesions, impacted teeth), per-tooth urgency and treatment
prompts. Bilingual: English at `/`, Persian (RTL) at `/fa/`.

Static [Astro](https://astro.build) site for GitHub Pages. The full DentalMind web app (portals, live
analysis) is a separate Next.js project; set `appUrl` in `src/data/site.ts` to link to it.
Plan and status: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Run locally

```bash
npm install
npm run dev       # http://localhost:4321/dentalmind.github.io/
npm run build     # → dist/
npm run preview
```

## Where things live

| Path | What |
|---|---|
| `src/i18n/en.ts`, `src/i18n/fa.ts` | All page copy. `fa.ts` is type-checked against `en.ts`, so a missing translation fails the build. |
| `src/data/metrics.json` | **The only source of numbers on the site** (home metrics strip, Evidence page). Copied from the DentalMind evaluation report; update it when new results are measured. |
| `src/data/site.ts` | Repo URL, optional app URL, optional demo-form endpoint, links to the Iranian Healthcare site. |
| `src/content/blog/` | Blog posts (English, Markdown). |
| `src/pages/[...lang]/` | Every page is generated twice: English (no prefix) and Persian (`/fa/`). |
| `src/components/home/`, `src/scripts/dental-explorer.ts` | The redesigned homepage and interactive synthetic panoramic image; findings, guided tour, annotations and bilingual review context. |
| `public/brand/dental-panorama-synthetic.png`, `docs/homepage-image-plan.md` | Generated hero asset, generation prompt and plan for clinician-verified real cases. |
| `src/components/PanoSketch.astro` | The schematic illustration used by the separate demo page. |
| `src/dentition/`, `tools/dentition/`, `public/models/dentition/` | The interactive 3D tooth atlas (`/dentition/`), its model pipeline and assets. See [tools/dentition/README.md](tools/dentition/README.md). The model is CC BY-SA 2.1 JP (BodyParts3D); third molars and gingiva are approximations. |

## Rules for content

- No number on the site without a measured source in `metrics.json`; weak results are shown too.
- Never claim regulatory clearance. Every page carries the research-prototype disclaimer.
- No real radiographs unless their licence allows public redistribution and they are de-identified.

## Deploy

Push to `main`; `.github/workflows/deploy.yml` builds and publishes to GitHub Pages
(**Settings → Pages → Source: GitHub Actions**). Served at
`https://dentaldetect.github.io/dentalmind.github.io/`. If the repo is renamed to
`dentaldetect.github.io` or a custom domain is added, set `base: '/'` in `astro.config.mjs`.

## X-ray atlas review and condition simulations

Open `/atlas/?example=1` for the new viewer, linked from the home, product, demo
and dentition pages. It includes finding tints/markers, uncertain states, manual
condition examples, report import/export, camera fixes and explicit root anatomy
mode. `npm run build` packages it into the Pages artifact automatically.

GitHub Pages serves static files only. By default, this viewer works offline
with manual scenarios and imported reports. Its built-in illustration is the
existing AI-generated hero image, with explicitly manual simulation examples;
it contains no patient images or detector predictions. No model weights, service
tokens or private configuration are published.

Automatic atlas analysis requires a separately hosted HTTPS backend. Set the
repository Actions variable `ATLAS_API_BASE` to the full public atlas API prefix
(for example `https://api.example.org/v1/atlas/`) to connect it at build time.
That backend must provide suitable CORS and authenticated upload access; a
browser bundle must never contain a shared inference-service secret. The
existing `PUBLIC_API_BASE` is a separate website API and is preserved.

Run `npm run test:atlas` for camera, condition, evidence and hosting checks.
The Android implementation prompt is [here](docs/mobile-app-build-prompt.md).

## Other backend features

The demo-request form, footer newsletter sign-up, cookie-free view counts and live X-ray analysis on
`/demo/` use the shared backend in `sites-api` (Cloudflare Worker). Build with
`PUBLIC_API_BASE=https://<worker-url>` (in CI: the repository variable `PUBLIC_API_BASE`).

Without it: the demo-request page links to GitHub issues, there is no newsletter form, and `/demo/` still
runs the in-browser image check and shows the labelled example result. Live analysis also needs
`MODEL_SERVICE_URL` set on the backend; until then `/demo/` explains that the model isn't connected.

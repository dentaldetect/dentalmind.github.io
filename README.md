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
| `src/components/PanoSketch.astro` | The hero illustration: a schematic panoramic X-ray drawn in SVG (no patient images). |

## Rules for content

- No number on the site without a measured source in `metrics.json`; weak results are shown too.
- Never claim regulatory clearance. Every page carries the research-prototype disclaimer.
- No real radiographs unless their licence allows public redistribution and they are de-identified.

## Deploy

Push to `main`; `.github/workflows/deploy.yml` builds and publishes to GitHub Pages
(**Settings → Pages → Source: GitHub Actions**). Served at
`https://dentaldetect.github.io/dentalmind.github.io/`. If the repo is renamed to
`dentaldetect.github.io` or a custom domain is added, set `base: '/'` in `astro.config.mjs`.

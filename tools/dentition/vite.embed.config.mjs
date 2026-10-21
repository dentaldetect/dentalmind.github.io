// Builds the standalone viewer (src/dentition/embed.ts) into dist-embed/ for the Android app's assets:
//   npm run build:dentition-embed
// One self-contained folder with relative paths: index.html, the scripts, dentition.glb, teeth.json, LICENSE.md.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { copyFileSync } from 'node:fs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = here('../../dist-embed');

export default defineConfig({
  root: here('./embed'),
  base: './',
  publicDir: false,
  build: {
    outDir: out,
    emptyOutDir: true,
    target: 'es2020',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 900,
  },
  plugins: [
    {
      name: 'copy-model',
      closeBundle() {
        for (const f of ['dentition.glb', 'teeth.json', 'LICENSE.md']) copyFileSync(here(`../../public/models/dentition/${f}`), `${out}/${f}`);
      },
    },
  ],
});

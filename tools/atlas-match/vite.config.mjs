import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const here=(p)=>fileURLToPath(new URL(p,import.meta.url));
export default defineConfig({root:here('./'),base:'./',publicDir:false,
  build:{outDir:here('../../dist-atlas-match'),emptyOutDir:true,target:'es2020',chunkSizeWarningLimit:1100}});

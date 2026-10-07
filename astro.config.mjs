// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Project site: served from https://dentaldetect.github.io/dentalmind.github.io/
// If the repo is renamed to dentaldetect.github.io (or a custom domain is added), set base to '/'.
export default defineConfig({
  site: 'https://dentaldetect.github.io',
  base: '/dentalmind.github.io',
  trailingSlash: 'always',
  integrations: [sitemap()],
});

export function resolveHosting(pageUrl: string, override = '') {
  const page = new URL(pageUrl);
  const localService = /\/v1\/atlas\/viewer\/?$/.test(page.pathname);
  const apiBase = override ? new URL(override.replace(/\/?$/, '/')) : localService ? new URL('../', page) : null;
  if (apiBase && (!['http:', 'https:'].includes(apiBase.protocol) || apiBase.username || apiBase.password || apiBase.search || apiBase.hash)) throw Error('Invalid atlas backend URL');
  if (apiBase && !apiBase.pathname.endsWith('/v1/atlas/')) throw Error('Atlas backend URL must end in /v1/atlas/');
  if (page.protocol === 'https:' && apiBase?.protocol === 'http:') throw Error('The public atlas requires an HTTPS backend');
  const modelBase = localService ? new URL('assets/', apiBase!) : new URL('../models/dentition/', page);
  return {
    apiBase: apiBase?.href ?? null,
    catalog: apiBase ? new URL('catalog', apiBase).href : new URL('catalog.json', page).href,
    model: new URL('dentition.glb', modelBase).href,
    license: new URL('LICENSE.md', modelBase).href,
    staticExampleImage: new URL('../brand/dental-panorama-synthetic.png', page).href,
    staticExampleReport: new URL('example-report.json', page).href,
  };
}

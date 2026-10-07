import { en, type Dict } from '../i18n/en';
import { fa } from '../i18n/fa';

export type Lang = 'en' | 'fa';
export const langs: Lang[] = ['en', 'fa'];
const dicts: Record<Lang, Dict> = { en, fa };

export const t = (lang: Lang): Dict => dicts[lang];
export const dir = (lang: Lang) => (lang === 'fa' ? 'rtl' : 'ltr');

/** getStaticPaths for pages under src/pages/[...lang]/: English at the root, Persian under /fa/. */
export const langPaths = () => langs.map((lang) => ({ params: { lang: lang === 'en' ? undefined : lang }, props: { lang } }));

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Site path with base path and language prefix. `p` is the English path, e.g. '/evidence/'. */
export function lp(lang: Lang, p = '/'): string {
  const path = p.startsWith('/') ? p : `/${p}`;
  return base + (lang === 'en' ? '' : `/${lang}`) + path;
}

/** Plain asset path with the base path (no language prefix). */
export const asset = (p: string) => base + (p.startsWith('/') ? p : `/${p}`);

/** Same page in the other language. `pathname` is Astro.url.pathname. */
export function switchLang(lang: Lang, pathname: string): string {
  const rest = pathname.slice(base.length) || '/';
  const english = lang === 'fa' ? rest.replace(/^\/fa(?=\/|$)/, '') || '/' : rest;
  return lp(lang === 'fa' ? 'en' : 'fa', english);
}

export function num(lang: Lang, n: number, digits = 2): string {
  return new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export const int = (lang: Lang, n: number) => new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(n);

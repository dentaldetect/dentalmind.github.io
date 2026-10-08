import { getCollection, type CollectionEntry } from 'astro:content';
import { int, type Lang } from './i18n';

export type Post = CollectionEntry<'blog'> | CollectionEntry<'blogFa'>;

/** Posts in the page language, newest first. A post without a Persian translation falls back to English. */
export async function getPosts(lang: Lang): Promise<Post[]> {
  const en = await getCollection('blog');
  const fa = lang === 'fa' ? await getCollection('blogFa') : [];
  const posts: Post[] = en.map((p) => fa.find((f) => f.id === p.id) ?? p);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Language the post is actually written in. */
export const postLang = (p: Post): Lang => (p.collection === 'blogFa' ? 'fa' : 'en');

export function postDate(lang: Lang, d: Date, style: 'medium' | 'long' = 'medium'): string {
  return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', { dateStyle: style }).format(d);
}

export const readTime = (lang: Lang, minutes: number) =>
  lang === 'fa' ? `${int('fa', minutes)} دقیقه مطالعه` : `${minutes} min read`;

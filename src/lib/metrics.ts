import metrics from '../data/metrics.json';
import { num, int, type Lang } from './i18n';

export type Row = (typeof metrics.groups)[number]['rows'][number] & { n?: number; weak?: boolean; lowerIsBetter?: boolean };
export type Group = (typeof metrics.groups)[number];

export const measuredOn = metrics.measuredOn;
export const groups = metrics.groups as Group[];

export function getRow(groupId: string, rowId: string): { group: Group; row: Row } {
  const group = groups.find((g) => g.id === groupId);
  const row = group?.rows.find((r) => r.id === rowId) as Row | undefined;
  if (!group || !row) throw new Error(`metrics.json has no ${groupId}/${rowId}`);
  return { group, row };
}

/** Format a metric with the precision it was recorded at. */
export function fmt(lang: Lang, row: Row): string {
  const digits = String(row.value).split('.')[1]?.length ?? 0;
  const v = num(lang, row.value, row.kind === 'percent' ? 1 : Math.max(2, digits));
  return row.kind === 'percent' ? (lang === 'fa' ? `٪${v}` : `${v}%`) : v;
}

export const metricName = (g: Group) => ('metric' in g && g.metric ? String(g.metric) : 'mAP50');
export const localized = (v: unknown, lang: Lang): string =>
  typeof v === 'string' ? v : (v as Record<Lang, string>)[lang];
export const count = int;

export const highlights = metrics.highlights;

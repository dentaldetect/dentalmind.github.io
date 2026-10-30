import { isFdi, type Fdi } from '../../src/dentition/teeth';

export type Finding = { id:string; code:string; score:number; decision:'positive'|'uncertain'; atlas_fdi:Fdi|null; box:{x:number;y:number;w:number;h:number} };
export function summarizeEvidence(findings: Finding[]) {
  const grouped: Partial<Record<Fdi, Finding[]>> = {};
  for (const finding of findings) if (finding.atlas_fdi && isFdi(finding.atlas_fdi)) (grouped[finding.atlas_fdi] ??= []).push(finding);
  return Object.fromEntries(Object.entries(grouped).map(([fdi, items]) => {
    const positive = items.some(f => f.decision === 'positive');
    const names = [...new Set(items.map(f => `${f.decision === 'uncertain' ? 'Possible ' : ''}${f.code.replaceAll('_', ' ')}`))];
    return [fdi, { kind: positive ? 'positive' as const : 'uncertain' as const, label: `AI: ${names.join(', ')} · review required` }];
  })) as Partial<Record<Fdi, { kind:'positive'|'uncertain'; label:string }>>;
}

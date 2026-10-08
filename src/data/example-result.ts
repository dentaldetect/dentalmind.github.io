// Example result shown on the demo page when the live model isn't connected.
// Same shape as the model service's /v1/analyze answer (dentalmind-web DemoResult), and the same teeth
// that PanoSketch.astro draws, so the illustration and the list agree. Always labelled as an example.
import type { Lang } from '../lib/i18n';

export interface Cluster {
  tooth_fdi: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  urgency: string;
  pattern: string;
  findings: { class_name: string; confidence: number; surface?: string }[];
  prompts: { options: { rank: number; text: string }[]; tests: string[]; red_flags: string[] };
}

const text = {
  en: {
    c36: ['Composite restoration', 'Ask about sensitivity to cold or sweets before treating'],
    t36: ['Bitewing X-ray of the area', 'Cold test'],
    c16: ['Pulp test first, then restoration or root canal treatment', 'Treat soon to avoid pulp involvement'],
    t16: ['Cold or electric pulp test', 'Periapical X-ray'],
    c21: ['Root canal treatment if the tooth is non-vital', 'Confirm with a periapical X-ray'],
    t21: ['Percussion and palpation', 'Pulp vitality test'],
    c48: ['Monitor if symptom-free', 'Surgical consultation if there is pain, swelling or decay on 47'],
    t48: ['Follow-up panoramic X-ray', 'CBCT if extraction is planned'],
  },
  fa: {
    c36: ['ترمیم کامپوزیت', 'پیش از درمان، درباره حساسیت به سرما یا شیرینی بپرسید'],
    t36: ['رادیوگرافی بایت‌وینگ از ناحیه', 'آزمون سرما'],
    c16: ['ابتدا آزمون پالپ، سپس ترمیم یا درمان ریشه', 'درمان زودهنگام برای جلوگیری از درگیری پالپ'],
    t16: ['آزمون پالپ با سرما یا الکتریکی', 'رادیوگرافی پری‌اپیکال'],
    c21: ['درمان ریشه در صورت غیرزنده بودن دندان', 'تأیید با رادیوگرافی پری‌اپیکال'],
    t21: ['دق و لمس', 'آزمون حیات پالپ'],
    c48: ['پیگیری در صورت نبود علامت', 'مشاوره جراحی در صورت درد، تورم یا پوسیدگی دندان ۴۷'],
    t48: ['رادیوگرافی پانورامیک پیگیری', 'CBCT در صورت برنامه کشیدن دندان'],
  },
};

const opts = (list: string[]) => list.map((t, i) => ({ rank: i + 1, text: t }));

export function exampleClusters(lang: Lang): Cluster[] {
  const x = text[lang];
  return [
    { tooth_fdi: '16', severity: 'CRITICAL', urgency: 'immediate', pattern: 'caries_pulp_risk', findings: [{ class_name: 'deep_caries', confidence: 0.71 }], prompts: { options: opts(x.c16), tests: x.t16, red_flags: [] } },
    { tooth_fdi: '21', severity: 'CRITICAL', urgency: 'immediate', pattern: 'endo_complex', findings: [{ class_name: 'periapical_lesion', confidence: 0.64 }], prompts: { options: opts(x.c21), tests: x.t21, red_flags: [] } },
    { tooth_fdi: '36', severity: 'HIGH', urgency: 'soon_2_weeks', pattern: 'caries_dentin', findings: [{ class_name: 'dentin_caries', confidence: 0.86, surface: 'occlusal' }], prompts: { options: opts(x.c36), tests: x.t36, red_flags: [] } },
    { tooth_fdi: '48', severity: 'MEDIUM', urgency: 'routine', pattern: 'impaction', findings: [{ class_name: 'impacted_tooth', confidence: 0.95 }], prompts: { options: opts(x.c48), tests: x.t48, red_flags: [] } },
  ];
}

// The dentition viewer's interface around the 3D scene: toolbar, tooth details (side panel, or bottom sheet
// on narrow screens), the 32-tooth chart (the accessible alternative to picking in 3D), labels, orientation
// badges, keyboard control and loading / error / no-WebGL states.
//
// Used by the website (src/components/DentitionViewer.astro) and by the Android app (embed.ts).
import type { Dict } from '../i18n/en';
import type { ArchView, DentitionScene, Preset } from './scene';
import { BY_FDI, CHART, TEETH, isFdi, neighbour, toothNumber, type Fdi, type Numbering, type ToothInfo } from './teeth';
import type { ConditionMap, EvidenceKind } from './conditions';

export type Strings = Dict['dentition'];

/** Clinical status of a tooth, e.g. from a contract-v1 analysis. Kept apart from the anatomy. */
export interface ToothStatus {
  summary?: string;
  evidence?: { kind: EvidenceKind; label: string };
  level: 'info' | 'watch' | 'act';
  /** Short text, already translated, e.g. "Deep caries (awaiting dentist review)". */
  items: string[];
}

export interface DentitionOptions {
  lang: 'en' | 'fa';
  strings: Strings;
  modelUrl: string;
  /** Where "Model and licence" links to. */
  licenseUrl: string;
  initial?: string | null;
  numbering?: Numbering;
  /** Keep the selected tooth in the page URL (?tooth=36). */
  syncUrl?: boolean;
  onSelect?(fdi: Fdi | null): void;
}

export interface DentitionHandle {
  select(fdi: Fdi | null, focus?: boolean): void;
  setStatus(status: Partial<Record<Fdi, ToothStatus>>): void;
  setNumbering(numbering: Numbering): void;
  setConditions(map: ConditionMap): void;
  readonly selected: Fdi | null;
  readonly scene: DentitionScene | null;
  /** Resolves when the model is shown, rejects if it cannot be (no WebGL, load error). */
  readonly ready: Promise<void>;
}

const PRESET_KEYS: Preset[] = ['front', 'right', 'left', 'upper', 'lower'];
const STATUS_GLYPH = { info: '●', watch: '▲', act: '■' } as const;

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** replaceChildren() that, like h(), skips null / false children. */
function fill(el: Element, ...children: Child[]): void {
  el.replaceChildren(...(children.filter(Boolean) as (Node | string)[]));
}

function svg(path: string, extra = ''): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}${extra}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

const ICONS = {
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  front: '<path d="M4 9.5c0-2 1.6-3.5 3.5-3.5h9c1.9 0 3.5 1.5 3.5 3.5"/><path d="M6.5 9.5v4.2c0 .8.6 1.3 1.3 1.3s1.3-.5 1.3-1.3V9.5m0 0v5c0 .9.7 1.5 1.5 1.5h.8c.8 0 1.5-.6 1.5-1.5v-5m0 0v4.2c0 .8.6 1.3 1.3 1.3s1.3-.5 1.3-1.3V9.5"/>',
  upper: '<path d="M5 17V11a7 7 0 0 1 14 0v6"/><path d="M12 21v-4m0 0-2 2m2-2 2 2"/>',
  lower: '<path d="M5 7v6a7 7 0 0 0 14 0V7"/><path d="M12 3v4m0 0-2-2m2 2 2-2"/>',
  both: '<path d="M5 10.5V9a7 7 0 0 1 14 0v1.5"/><path d="M5 13.5V15a7 7 0 0 0 14 0v-1.5"/>',
  roots: '<path d="M8 3.5c-2 0-3 1.6-3 3.6 0 2.4 1.2 3.4 1.7 5.5L8 20c.3 1 1.6 1 1.8 0l1.2-5h2l1.2 5c.2 1 1.5 1 1.8 0l1.3-7.4c.5-2.1 1.7-3.1 1.7-5.5 0-2-1-3.6-3-3.6-1.6 0-2.4.9-4 .9s-2.4-.9-4-.9Z"/>',
  sliders: '<path d="M4 7h10m4 0h2M4 17h4m4 0h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  focus: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5"/>',
  prev: '<path d="m15 6-6 6 6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};

function sideIcon(letter: string, toLeft: boolean): SVGSVGElement {
  // A letter for the patient's side and an arrow pointing where that side is when facing the patient.
  const arrow = toLeft ? '<path d="M8 12H3m0 0 2.5-2.5M3 12l2.5 2.5"/>' : '<path d="M16 12h5m0 0-2.5-2.5M21 12l-2.5 2.5"/>';
  const x = toLeft ? 15 : 9;
  return svg(arrow, `<text x="${x}" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none" font-family="inherit">${letter}</text>`);
}

export function mountDentition(root: HTMLElement, opts: DentitionOptions): DentitionHandle {
  const s = opts.strings;
  const lang = opts.lang;
  let numbering: Numbering = opts.numbering ?? 'fdi';
  let selected: Fdi | null = null;
  let hovered: Fdi | null = null;
  let status: Partial<Record<Fdi, ToothStatus>> = {};
  let scene: DentitionScene | null = null;
  let activePreset: Preset | null = 'default';
  let archAuto = false;
  const uid = `dm3d-${Math.random().toString(36).slice(2, 8)}`;
  const touchFirst = matchMedia('(pointer: coarse)').matches;

  // ------------------------------------------------------------------------------------------ markup

  // The host is the size container (container queries); the layout lives on `ui` inside it.
  root.classList.add('dm3d-host');
  const ui = document.createElement('div');
  ui.className = 'dm3d';
  ui.dataset.state = 'loading';
  root.replaceChildren(ui);

  const helpId = `${uid}-help`;
  const viewport = h('div', { class: 'dm3d-viewport', tabindex: '0', role: 'application', 'aria-roledescription': '3D', 'aria-label': s.viewer, 'aria-describedby': helpId });
  const labels = h('div', { class: 'dm3d-labels', 'aria-hidden': 'true' });
  const hoverLabel = h('div', { class: 'dm3d-label dm3d-label-hover', hidden: true });
  const selectLabel = h('div', { class: 'dm3d-label dm3d-label-selected', hidden: true });
  const leader = h('div', { class: 'dm3d-leader', hidden: true });
  const evidenceMarkers = new Map<Fdi, HTMLButtonElement>();
  const evidenceLayer = h('div', { class: 'dm3d-evidence-layer' });
  const hoverLeader = h('div', { class: 'dm3d-leader dm3d-leader-hover', hidden: true });
  labels.append(hoverLeader, leader, hoverLabel, selectLabel);
  const orientR = h('span', { class: 'dm3d-orient', 'data-side': 'right' }, s.patientRight);
  const orientL = h('span', { class: 'dm3d-orient', 'data-side': 'left' }, s.patientLeft);
  const orientSide = h('span', { class: 'dm3d-orient dm3d-orient-facing', hidden: true });
  const orient = h('div', { class: 'dm3d-orients', 'aria-hidden': 'true' }, orientR, orientL, orientSide);
  viewport.append(labels, orient, evidenceLayer);

  // Toolbar: reset, the five presets, then (wide screens) arches and roots, then the display menu.
  const tipBtn = (cls: string, label: string, icon: SVGSVGElement, extra: Record<string, string> = {}) =>
    h('button', { type: 'button', class: `dm3d-btn ${cls}`, 'aria-label': label, 'data-tip': label, ...extra }, icon);
  const resetBtn = h('button', { type: 'button', class: 'dm3d-btn dm3d-reset', 'data-tip': s.reset }, svg(ICONS.reset), h('span', { class: 'dm3d-reset-text' }, s.reset));
  const presetBtns = new Map<Preset, HTMLButtonElement>();
  const presetIcon: Record<string, () => SVGSVGElement> = {
    front: () => svg(ICONS.front),
    // The patient's right is on the viewer's left when facing the patient.
    right: () => sideIcon(s.sideLetter.right, true),
    left: () => sideIcon(s.sideLetter.left, false),
    upper: () => svg(ICONS.upper),
    lower: () => svg(ICONS.lower),
  };
  for (const p of PRESET_KEYS) presetBtns.set(p, tipBtn('dm3d-preset', s.views[p], presetIcon[p](), { 'aria-pressed': 'false', 'data-preset': p }));
  const archBtns = new Map<ArchView, HTMLButtonElement>();
  for (const a of ['both', 'upper', 'lower'] as ArchView[]) archBtns.set(a, tipBtn('dm3d-arch', s.archView[a], svg(ICONS[a]), { 'aria-pressed': String(a === 'both'), 'data-arch': a }));
  const rootsBtn = tipBtn('dm3d-roots', s.roots, svg(ICONS.roots), { 'aria-pressed': 'false' });
  const menuBtn = tipBtn('dm3d-menu-btn', s.display, svg(ICONS.sliders), { 'aria-expanded': 'false', 'aria-controls': `${uid}-menu` });

  const radio = (name: string, value: string, label: string, checked: boolean) =>
    h('label', { class: 'dm3d-choice' }, h('input', { type: 'radio', name: `${uid}-${name}`, value, checked }), h('span', {}, label));
  const check = (label: string, checked: boolean) => {
    const input = h('input', { type: 'checkbox', checked });
    return { input, el: h('label', { class: 'dm3d-choice' }, input, h('span', {}, label)) };
  };
  const menuArches = h('fieldset', { class: 'dm3d-field' }, h('legend', {}, s.arches), ...(['both', 'upper', 'lower'] as ArchView[]).map((a) => radio('arch', a, s.archView[a], a === 'both')));
  const rootsCheck = check(s.roots, false);
  const biteCheck = check(s.bite, true);
  const menuNumbering = h('fieldset', { class: 'dm3d-field' }, h('legend', {}, s.numbering), ...(['fdi', 'universal'] as Numbering[]).map((n) => radio('num', n, s.numberings[n], n === numbering)));
  const menu = h('div', { class: 'dm3d-menu', id: `${uid}-menu`, role: 'group', 'aria-label': s.display, hidden: true }, menuArches, rootsCheck.el, biteCheck.el, menuNumbering);

  const toolbar = h(
    'div',
    { class: 'dm3d-toolbar', role: 'toolbar', 'aria-label': s.toolbar },
    resetBtn,
    h('span', { class: 'dm3d-group' }, ...presetBtns.values()),
    h('span', { class: 'dm3d-group dm3d-wide' }, ...archBtns.values()),
    h('span', { class: 'dm3d-group dm3d-wide' }, rootsBtn),
    h('span', { class: 'dm3d-group dm3d-menu-wrap' }, menuBtn, menu),
  );

  const progressBar = h('span', { class: 'dm3d-progress-bar' });
  const progress = h('span', { class: 'dm3d-progress', role: 'progressbar', 'aria-label': s.loading, 'aria-valuemin': '0', 'aria-valuemax': '100' }, progressBar);
  const overlayText = h('p', {}, s.loading);
  const overlayBtn = h('button', { type: 'button', class: 'dm3d-cta', hidden: true }, s.retry);
  const overlay = h('div', { class: 'dm3d-overlay', role: 'status' }, overlayText, progress, overlayBtn);
  const hint = h('p', { class: 'dm3d-hint', 'aria-hidden': 'true' }, touchFirst ? s.hintTouch : s.hintPointer);
  const credit = h('p', { class: 'dm3d-credit' }, s.credit, ' · ', h('a', { href: opts.licenseUrl }, s.creditMore));
  const stage = h('div', { class: 'dm3d-stage' }, viewport, toolbar, overlay, hint, credit);

  // Details + chart: side panel on wide containers, bottom sheet on narrow ones.
  const sheetBtn = h('button', { type: 'button', class: 'dm3d-sheet-toggle', 'aria-expanded': 'false', 'aria-controls': `${uid}-panel-body` });
  const sheetSummary = h('span', { class: 'dm3d-sheet-summary' });
  sheetBtn.append(h('span', { class: 'dm3d-grip', 'aria-hidden': 'true' }), sheetSummary, svg(ICONS.chevronUp));
  const detail = h('section', { class: 'dm3d-detail', 'aria-labelledby': `${uid}-detail-title` });
  const chartGrid = h('div', { class: 'dm3d-chart-grid', dir: 'ltr' });
  const chartBtns = new Map<Fdi, HTMLButtonElement>();
  const chartRow = (title: string) => h('p', { class: 'dm3d-chart-row' }, title);
  // Four quadrant rows of eight, in chart order: each right quadrant runs from the back teeth to the
  // midline, each left quadrant from the midline to the back (as the two halves of a 16-wide chart).
  for (const arch of ['upper', 'lower'] as const) {
    const row = CHART[arch];
    const archName = arch === 'upper' ? s.upperRow : s.lowerRow;
    chartGrid.append(chartRow(`${archName} · ${s.patientRight}`));
    for (const f of row.slice(0, 8)) chartGrid.append(chartButton(f));
    chartGrid.append(chartRow(`${archName} · ${s.patientLeft}`));
    for (const f of row.slice(8)) chartGrid.append(chartButton(f));
  }
  const chart = h(
    'section',
    { class: 'dm3d-chart', 'aria-labelledby': `${uid}-chart-title` },
    h('h3', { id: `${uid}-chart-title` }, s.chart),
    chartGrid,
  );
  const panelBody = h('div', { class: 'dm3d-panel-body', id: `${uid}-panel-body` }, detail, chart);
  const panel = h('aside', { class: 'dm3d-panel', 'aria-label': s.details }, sheetBtn, panelBody);
  const live = h('p', { class: 'dm3d-sr', 'aria-live': 'polite' });
  const help = h('p', { class: 'dm3d-sr', id: helpId }, s.help);
  ui.append(stage, panel, live, help);

  function chartButton(f: Fdi): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'dm3d-tooth', 'data-fdi': f, 'aria-pressed': 'false', tabindex: f === '11' ? '0' : '-1' });
    if (BY_FDI.get(f)!.geometry === 'placeholder') b.dataset.placeholder = '';
    chartBtns.set(f, b);
    return b;
  }

  // ------------------------------------------------------------------------------------ rendering

  const name = (t: ToothInfo) => t.name[lang];
  const num = (f: Fdi) => toothNumber(f, numbering);

  function toothLabel(t: ToothInfo): string {
    const parts = [`${s.tooth} ${num(t.fdi)}`, name(t)];
    if (t.geometry === 'placeholder') parts.push(s.placeholderShort);
    const st = status[t.fdi];
    if (st) parts.push(`${s.statusLevels[st.level]}: ${st.items.join('; ')}`);
    return parts.join(', ');
  }

  function renderChart(): void {
    for (const [f, b] of chartBtns) {
      const t = BY_FDI.get(f)!;
      const st = status[f];
      fill(b, h('span', { class: 'dm3d-tooth-num' }, num(f)), st ? h('span', { class: 'dm3d-status', 'data-level': st.level }, STATUS_GLYPH[st.level]) : null);
      b.setAttribute('aria-label', toothLabel(t));
      b.setAttribute('aria-pressed', String(f === selected));
      b.title = `${num(f)} · ${name(t)}`;
    }
  }

  function renderDetail(): void {
    const t = selected ? BY_FDI.get(selected)! : null;
    if (!t) {
      fill(detail, h('h2', { id: `${uid}-detail-title`, class: 'dm3d-sr' }, s.details), h('p', { class: 'dm3d-empty' }, s.empty));
      sheetSummary.textContent = s.empty;
      return;
    }
    const st = status[t.fdi];
    const row = (k: string, v: string) => [h('dt', {}, k), h('dd', {}, v)];
    const btn = (label: string, icon: string, onClick: () => void, cls = '') => {
      const b = h('button', { type: 'button', class: `dm3d-action ${cls}`, 'aria-label': label, 'data-tip': label }, svg(icon));
      b.addEventListener('click', onClick);
      return b;
    };
    const focusBtn = h('button', { type: 'button', class: 'dm3d-action dm3d-action-text' }, svg(ICONS.focus), h('span', {}, s.focus));
    focusBtn.addEventListener('click', () => scene?.focusTooth(t.fdi));
    fill(
      detail,
      h(
        'div',
        { class: 'dm3d-detail-head' },
        h('span', { class: 'dm3d-badge', 'aria-hidden': 'true' }, h('span', { class: 'dm3d-check' }, '✓'), num(t.fdi)),
        h('div', {}, h('h2', { id: `${uid}-detail-title` }, name(t)), h('p', { class: 'dm3d-numbers' }, h('bdi', {}, `${s.fdi} ${t.fdi}`), ' · ', h('bdi', {}, `${s.universal} ${t.universal}`))),
      ),
      h('dl', { class: 'dm3d-facts' }, ...row(s.arch, s.archNames[t.arch]), ...row(s.side, s.sides[t.side]), ...row(s.type, s.types[t.type])),
      t.geometry === 'placeholder' ? h('p', { class: 'dm3d-note' }, s.placeholder) : null,
      h('h3', {}, s.findings),
      st
        ? h('ul', { class: 'dm3d-findings', 'data-level': st.level }, ...st.items.map((i) => h('li', {}, h('span', { class: 'dm3d-status', 'data-level': st.level, 'aria-hidden': 'true' }, STATUS_GLYPH[st.level]), ` ${s.statusLevels[st.level]}: ${i}`)))
        : h('p', { class: 'dm3d-muted' }, s.noFindings),
      h(
        'div',
        { class: 'dm3d-actions' },
        btn(s.previous, lang === 'fa' ? ICONS.next : ICONS.prev, () => select(neighbour(t.fdi, 'right'), 'chart')),
        focusBtn,
        btn(s.next, lang === 'fa' ? ICONS.prev : ICONS.next, () => select(neighbour(t.fdi, 'left'), 'chart')),
        btn(s.clear, ICONS.close, () => select(null, 'chart'), 'dm3d-action-clear'),
      ),
    );
    fill(sheetSummary, h('b', {}, num(t.fdi)), ` · ${name(t)}`, st?.evidence ? h('span', { class: 'dm3d-evidence-summary', 'data-evidence': st.evidence.kind }, st.evidence.label) : st?.summary ? h('span', { class: 'dm3d-evidence-summary', 'data-evidence': 'unassessed' }, st.summary) : null);
  }

  function renderEvidence(): void {
    evidenceLayer.replaceChildren(); evidenceMarkers.clear();
    const tint: Partial<Record<Fdi, EvidenceKind>> = {};
    for (const [key, st] of Object.entries(status)) {
      if (!isFdi(key) || !st?.evidence) continue;
      const evidence = st.evidence;
      tint[key] = evidence.kind;
      const label = `${s.tooth} ${num(key)} · ${evidence.label}`;
      const marker = h('button', { type: 'button', class: 'dm3d-evidence-marker', 'data-evidence': evidence.kind,
        'aria-label': label, title: label }, `${num(key)} ${evidence.kind === 'uncertain' ? '?' : evidence.kind === 'manual' ? 'S' : '!'}`);
      marker.onclick = () => { select(key, 'chart'); scene?.focusTooth(key); };
      evidenceMarkers.set(key, marker); evidenceLayer.append(marker);
    }
    scene?.setEvidence(tint);
    renderLabels();
  }

  function renderLabels(): void {
    if (!scene) return;
    const w = viewport.clientWidth;
    const hgt = viewport.clientHeight;
    const top = 92; // below the toolbar and the orientation badges
    const bottom = hgt - 44; // above the hint and the credit
    const bounds = scene.screenBounds();
    for (const [fdi, marker] of evidenceMarkers) {
      const a = scene.anchor(fdi), p = scene.crownPoint(fdi, 0.35);
      marker.hidden = !a?.onScreen || !p;
      if (!marker.hidden && p) marker.style.transform = `translate(${Math.round(Math.max(4, Math.min(w - 58, p.x + 10)))}px, ${Math.round(Math.max(62, Math.min(hgt - 50, p.y - 12)))}px)`;
    }
    // Labels go in the margin around the model, joined to the tooth by a leader line, so they never sit on
    // the teeth. When the model fills the view there is no margin: then beside the crown, away from it.
    const place = (el: HTMLElement, line: HTMLElement, fdi: Fdi | null) => {
      const a = fdi ? scene!.anchor(fdi) : null;
      const p = fdi ? scene!.crownPoint(fdi, 0.15) : null;
      if (!a || !p || !a.onScreen) {
        el.hidden = line.hidden = true;
        return;
      }
      el.hidden = false;
      // Hidden behind other teeth from this side: say so with a dashed leader and a faded label.
      const r = viewport.getBoundingClientRect();
      const behind = scene!.pick(r.left + p.x, r.top + p.y) !== fdi;
      el.classList.toggle('dm3d-behind', behind);
      line.classList.toggle('dm3d-behind', behind);
      const lw = el.offsetWidth;
      const lh = el.offsetHeight;
      let x = NaN;
      let y = NaN;
      if (bounds) {
        const m = 12;
        const room = {
          top: bounds.top - m - lh >= top,
          bottom: bounds.bottom + m + lh <= bottom,
          left: bounds.left - m - lw >= 8,
          right: bounds.right + m + lw <= w - 8,
        };
        const cx = (bounds.left + bounds.right) / 2;
        const cy = (bounds.top + bounds.bottom) / 2;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const options = (
          [
            ['top', -dy / (bounds.bottom - bounds.top || 1)],
            ['bottom', dy / (bounds.bottom - bounds.top || 1)],
            ['left', -dx / (bounds.right - bounds.left || 1)],
            ['right', dx / (bounds.right - bounds.left || 1)],
          ] as const
        ).filter(([side]) => room[side]);
        options.sort((u, v) => v[1] - u[1]);
        const side = options[0]?.[0];
        if (side === 'top' || side === 'bottom') {
          x = Math.max(8, Math.min(w - lw - 8, p.x - lw / 2));
          y = side === 'top' ? bounds.top - m - lh : bounds.bottom + m;
        } else if (side === 'left' || side === 'right') {
          y = Math.max(top, Math.min(bottom - lh, p.y - lh / 2));
          x = side === 'left' ? bounds.left - m - lw : bounds.right + m;
        }
      }
      if (Number.isNaN(x)) {
        const gap = 34;
        x = Math.max(8, Math.min(w - lw - 8, a.x + a.dx * gap - lw / 2 + (a.dx * lw) / 2));
        y = Math.max(top, Math.min(bottom - lh, a.y + a.dy * gap - lh / 2 + (a.dy * lh) / 2));
      }
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      // Leader from the crown to the nearest point of the label.
      const ex = Math.max(x, Math.min(x + lw, p.x));
      const ey = Math.max(y, Math.min(y + lh, p.y));
      const len = Math.hypot(ex - p.x, ey - p.y);
      line.hidden = len < 6;
      line.style.width = `${len}px`;
      line.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${Math.atan2(ey - p.y, ex - p.x)}rad)`;
    };
    place(selectLabel, leader, selected);
    place(hoverLabel, hoverLeader, hovered && hovered !== selected ? hovered : null);

    const o = scene.orientation();
    if (o.side) {
      orientR.hidden = orientL.hidden = true;
      orientSide.hidden = false;
      orientSide.textContent = s.facing[o.side];
    } else {
      orientSide.hidden = true;
      orientR.hidden = orientL.hidden = false;
      // Badges sit in the margins, away from the model: below the toolbar at the two side edges when the
      // left-right axis runs across the screen, at the top and bottom centre when it runs up and down.
      const across = Math.abs(o.dx) >= Math.abs(o.dy);
      for (const [el, sign] of [[orientL, 1], [orientR, -1]] as const) {
        const ew = el.offsetWidth;
        const eh = el.offsetHeight;
        const towardsEnd = sign * (across ? o.dx : o.dy) > 0;
        const x = across ? (towardsEnd ? w - ew - 12 : 12) : (w - ew) / 2;
        const y = across ? 64 : towardsEnd ? hgt - eh - 40 : 64;
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    }
  }

  function updateLabelsContent(): void {
    const sel = selected ? BY_FDI.get(selected)! : null;
    selectLabel.replaceChildren(...(sel ? [h('span', { class: 'dm3d-check' }, '✓'), h('b', {}, num(sel.fdi))] : []));
    const hov = hovered ? BY_FDI.get(hovered)! : null;
    hoverLabel.replaceChildren(...(hov ? [h('b', {}, num(hov.fdi)), ` ${s.types[hov.type]}`] : []));
    renderLabels();
  }

  // ------------------------------------------------------------------------------------- behaviour

  function announce(text: string): void {
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = text));
  }

  function select(fdi: Fdi | null, via: 'pointer' | 'keyboard' | 'chart' | 'api'): void {
    if (fdi === selected) return;
    selected = fdi;
    if (fdi && scene) {
      const arch = BY_FDI.get(fdi)!.arch;
      if (scene.archView !== 'both' && scene.archView !== arch) setArchView('both', false);
    }
    scene?.setSelected(fdi);
    renderChart();
    renderDetail();
    updateLabelsContent();
    if (fdi) {
      const b = chartBtns.get(fdi)!;
      for (const x of chartBtns.values()) x.tabIndex = x === b ? 0 : -1;
      announce(s.announceSelected.replace('{number}', num(fdi)).replace('{name}', BY_FDI.get(fdi)!.name[lang]));
    } else if (via !== 'api') {
      announce(s.announceCleared);
    }
    if (opts.syncUrl) {
      const url = new URL(location.href);
      if (fdi) url.searchParams.set('tooth', fdi);
      else url.searchParams.delete('tooth');
      history.replaceState(history.state, '', url);
    }
    opts.onSelect?.(fdi);
    root.dispatchEvent(new CustomEvent('dentition:select', { detail: { fdi }, bubbles: true }));
  }

  function setHovered(fdi: Fdi | null): void {
    if (fdi === hovered) return;
    hovered = fdi;
    scene?.setHovered(fdi);
    updateLabelsContent();
  }

  function setPreset(p: Preset | null): void {
    activePreset = p;
    for (const [k, b] of presetBtns) b.setAttribute('aria-pressed', String(k === p));
  }

  function goTo(p: Preset): void {
    if (!scene) return;
    if (p === 'upper' || p === 'lower') {
      setArchView(p, true);
    } else if (archAuto) {
      setArchView('both', false);
    }
    scene.goTo(p);
    setPreset(p === 'default' ? null : p);
    flashHint(p === 'default' ? s.reset : s.views[p]);
  }

  function setArchView(v: ArchView, auto: boolean): void {
    archAuto = auto;
    scene?.setArchView(v);
    for (const [k, b] of archBtns) b.setAttribute('aria-pressed', String(k === v));
    for (const i of menuArches.querySelectorAll('input')) i.checked = i.value === v;
    renderLabels();
  }

  function setRoots(on: boolean): void {
    scene?.setRoots(on);
    rootsBtn.setAttribute('aria-pressed', String(on));
    rootsCheck.input.checked = on;
  }

  function setNumbering(n: Numbering): void {
    numbering = n;
    for (const i of menuNumbering.querySelectorAll('input')) i.checked = i.value === n;
    renderChart();
    renderDetail();
    updateLabelsContent();
  }

  let hintTimer = 0;
  function flashHint(text: string): void {
    hint.textContent = text;
    hint.classList.add('dm3d-hint-flash');
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      hint.classList.remove('dm3d-hint-flash');
      hint.textContent = touchFirst ? s.hintTouch : s.hintPointer;
    }, 1800);
  }

  // Toolbar
  resetBtn.addEventListener('click', () => {
    if (!scene) return;
    setArchView('both', false);
    setRoots(false);
    scene.setBiteOpen(true);
    biteCheck.input.checked = true;
    scene.goTo('default');
    setPreset(null);
    flashHint(s.reset);
  });
  for (const [p, b] of presetBtns) b.addEventListener('click', () => goTo(p));
  for (const [a, b] of archBtns) b.addEventListener('click', () => setArchView(a, false));
  rootsBtn.addEventListener('click', () => setRoots(rootsBtn.getAttribute('aria-pressed') !== 'true'));
  menuArches.addEventListener('change', (e) => setArchView((e.target as HTMLInputElement).value as ArchView, false));
  rootsCheck.input.addEventListener('change', () => setRoots(rootsCheck.input.checked));
  biteCheck.input.addEventListener('change', () => scene?.setBiteOpen(biteCheck.input.checked));
  menuNumbering.addEventListener('change', (e) => setNumbering((e.target as HTMLInputElement).value as Numbering));
  const closeMenu = (refocus = false) => {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    if (refocus) menuBtn.focus();
  };
  menuBtn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector<HTMLInputElement>('input:checked, input')?.focus();
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeMenu(true);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== menuBtn && !menuBtn.contains(e.target as Node)) closeMenu();
  });

  // Bottom sheet
  sheetBtn.addEventListener('click', () => {
    const open = ui.classList.toggle('dm3d-sheet-open');
    sheetBtn.setAttribute('aria-expanded', String(open));
    sheetBtn.setAttribute('aria-label', open ? s.hideList : s.showList);
  });
  sheetBtn.setAttribute('aria-label', s.showList);

  // Chart: buttons with a roving tab stop; arrows move, focus previews the tooth on the model.
  chartGrid.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.dm3d-tooth');
    if (b && isFdi(b.dataset.fdi!)) select(b.dataset.fdi === selected ? null : (b.dataset.fdi as Fdi), 'chart');
  });
  chartGrid.addEventListener('focusin', (e) => {
    const f = (e.target as HTMLElement).dataset.fdi;
    if (f && isFdi(f)) setHovered(f);
  });
  chartGrid.addEventListener('focusout', () => setHovered(null));
  chartGrid.addEventListener('keydown', (e) => {
    const f = (e.target as HTMLElement).dataset.fdi;
    if (!f || !isFdi(f)) return;
    const order = [...CHART.upper, ...CHART.lower];
    const i = order.indexOf(f);
    const cols = getComputedStyle(chartGrid).gridTemplateColumns.split(' ').length;
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: order.length - 1 - i };
    const d = moves[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const next = order[Math.max(0, Math.min(order.length - 1, i + d))];
    for (const b of chartBtns.values()) b.tabIndex = -1;
    const nb = chartBtns.get(next)!;
    nb.tabIndex = 0;
    nb.focus();
  });

  // Viewport: tap vs drag, hover, keyboard.
  // A tap is a single pointer that goes down and up within a few pixels and well under a second; anything
  // else (a drag, a pinch, a long press) belongs to the camera controls.
  let down: { x: number; y: number; t: number; id: number; touch: boolean } | null = null;
  const active = new Set<number>();
  viewport.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) active.clear();
    active.add(e.pointerId);
    down = active.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, touch: e.pointerType !== 'mouse' } : null;
    if (!menu.hidden) closeMenu();
  }, true);
  const endPointer = (e: PointerEvent) => {
    active.delete(e.pointerId);
    if (!down || down.id !== e.pointerId || !scene) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const slop = down.touch ? 10 : 5;
    if (e.type === 'pointerup' && moved <= slop && performance.now() - down.t < 650 && e.button === 0) {
      const f = scene.pick(e.clientX, e.clientY, down.touch);
      select(f, 'pointer');
    }
    down = null;
  };
  viewport.addEventListener('pointerup', endPointer, true);
  viewport.addEventListener('pointercancel', endPointer, true);
  viewport.addEventListener('dblclick', (e) => {
    const f = scene?.pick(e.clientX, e.clientY);
    if (f) scene!.focusTooth(f);
  });
  let hoverFrame = 0;
  viewport.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons || !scene) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(hoverFrame);
    hoverFrame = requestAnimationFrame(() => {
      const f = scene!.pick(clientX, clientY);
      setHovered(f);
      viewport.style.cursor = f ? 'pointer' : '';
    });
  });
  viewport.addEventListener('pointerleave', () => {
    cancelAnimationFrame(hoverFrame);
    setHovered(null);
  });
  viewport.addEventListener('keydown', (e) => {
    if (!scene) return;
    const step = Math.PI / 18;
    const cur = selected ?? hovered;
    let handled = true;
    if (e.shiftKey && e.key.startsWith('Arrow')) {
      const map: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      scene.orbitBy(...map[e.key]);
      setPreset(null);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      select(cur ? neighbour(cur, e.key === 'ArrowRight' ? 'left' : 'right') : '11', 'keyboard');
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      select(cur ? neighbour(cur, 'opposite') : e.key === 'ArrowUp' ? '11' : '41', 'keyboard');
    } else if (e.key === 'Home' || e.key === 'End') {
      select(neighbour(cur ?? '11', e.key === 'Home' ? 'first' : 'last'), 'keyboard');
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (selected) scene.focusTooth(selected);
      else select('11', 'keyboard');
    } else if (e.key === 'Escape') {
      if (selected) select(null, 'keyboard');
      else handled = false;
    } else if (e.key === '+' || e.key === '=') {
      scene.zoomBy(0.82);
    } else if (e.key === '-' || e.key === '_') {
      scene.zoomBy(1.22);
    } else if (e.key === 'r' || e.key === 'R' || e.key === '0') {
      resetBtn.click();
    } else if (/^[1-5]$/.test(e.key)) {
      goTo(PRESET_KEYS[Number(e.key) - 1]);
    } else {
      handled = false;
    }
    if (handled) e.preventDefault();
  });

  // ---------------------------------------------------------------------------------------- start

  renderChart();
  renderDetail();
  const initial = opts.initial && isFdi(opts.initial) ? opts.initial : null;
  if (initial) select(initial, 'api');

  function fail(state: 'error' | 'nowebgl' | 'lost', retry?: () => void): void {
    ui.dataset.state = state;
    overlayText.textContent = state === 'nowebgl' ? s.noWebgl : state === 'lost' ? s.contextLost : s.error;
    progress.hidden = true;
    overlayBtn.hidden = !retry;
    overlayBtn.textContent = state === 'lost' ? s.reload : s.retry;
    overlayBtn.onclick = retry ?? null;
    if (state === 'nowebgl') {
      // Without 3D the details and chart are the whole viewer: open the sheet on narrow screens.
      ui.classList.add('dm3d-sheet-open');
      sheetBtn.setAttribute('aria-expanded', 'true');
    }
  }

  const ready = (async () => {
    let Scene: typeof import('./scene').DentitionScene;
    try {
      Scene = (await import('./scene')).DentitionScene;
      scene = new Scene(viewport, {
        onProgress: (f) => {
          progressBar.style.width = `${Math.round(f * 100)}%`;
          progress.setAttribute('aria-valuenow', String(Math.round(f * 100)));
        },
        onFrame: renderLabels,
        onContextLost: () => fail('lost', () => location.reload()),
        onCameraStart: () => {
          setPreset(null);
          hint.classList.add('dm3d-hint-used');
        },
      });
      const inset = () => scene?.setTopInset(Math.round(toolbar.offsetTop + toolbar.offsetHeight));
      new ResizeObserver(inset).observe(toolbar);
      inset();
    } catch (err) {
      fail('nowebgl');
      throw err;
    }
    const load = async (): Promise<void> => {
      ui.dataset.state = 'loading';
      overlayText.textContent = s.loading;
      progress.hidden = false;
      overlayBtn.hidden = true;
      try {
        await scene!.load(opts.modelUrl);
      } catch (err) {
        fail('error', () => void load().catch(() => {}));
        throw err;
      }
      ui.dataset.state = 'ready';
      const accent = getComputedStyle(root).getPropertyValue('--dm-accent-strong').trim();
      if (/^#[0-9a-f]{3,8}$/i.test(accent)) scene!.setAccent(accent);
      scene!.setSelected(selected);
      renderEvidence();
      updateLabelsContent();
    };
    await load();
  })();
  ready.catch(() => {});

  return {
    select: (fdi, focus = false) => {
      select(fdi, 'api');
      if (fdi && focus) void ready.then(() => scene?.focusTooth(fdi));
    },
    setStatus: (map) => {
      status = { ...map };
      renderChart();
      renderDetail();
      renderEvidence();
    },
    setNumbering,
    setConditions: map => { void ready.then(() => scene?.setConditions(map)); },
    get selected() {
      return selected;
    },
    get scene() {
      return scene;
    },
    ready,
  };
}

export { TEETH };

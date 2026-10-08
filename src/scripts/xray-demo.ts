// X-ray demo: in-browser quality check, then POST to the shared backend (/v1/xray/analyze).
// Model output is rendered with textContent only; colours and coordinates were validated server-side.
type Status = 'pass' | 'warn' | 'fail';
interface Finding { class_name: string; confidence: number; surface?: string }
interface Cluster {
  tooth_fdi: string;
  severity: string;
  urgency: string;
  pattern: string;
  findings: Finding[];
  prompts?: { options?: { rank: number; text: string }[]; tests?: string[] };
}
interface Overlay { tooth: string; x: number; y: number; type: string; color: string }
type T = Record<string, any>;

const root = document.getElementById('xray-app');
if (root) init(root);

function init(root: HTMLElement) {
  const t: T = JSON.parse(root.dataset.t!);
  const api = root.dataset.api ?? '';
  const lang = root.dataset.lang ?? 'en';
  const example: Cluster[] = JSON.parse(root.dataset.example!);
  const nf = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { style: 'percent' });
  const $ = <E extends HTMLElement>(sel: string) => root.querySelector<E>(sel)!;

  const input = $<HTMLInputElement>('#xr-file');
  const drop = $('#xr-drop');
  const modalitySel = $<HTMLSelectElement>('#xr-modality');
  const checksBox = $('#xr-checks');
  const checksList = $('#xr-checks-list');
  const verdict = $('#xr-verdict');
  const canvas = $<HTMLCanvasElement>('#xr-canvas');
  const previewWrap = $('#xr-preview');
  const analyseBtn = $<HTMLButtonElement>('#xr-analyse');
  const exampleBtn = $<HTMLButtonElement>('#xr-example');
  const message = $('#xr-message');
  const results = $('#xr-results');
  const resultsTitle = $('#xr-results-title');
  const resultsNote = $('#xr-results-note');
  const clustersBox = $('#xr-clusters');
  const exampleFigure = $('#xr-example-figure');

  let file: File | null = null;
  let image: HTMLImageElement | null = null;

  const say = (text: string, kind: 'info' | 'error' = 'info') => {
    message.hidden = !text;
    message.dataset.kind = kind;
    message.textContent = text;
  };

  input.addEventListener('change', () => input.files?.[0] && load(input.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.dataset.over = 'true'; });
  drop.addEventListener('dragleave', () => { delete drop.dataset.over; });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    delete drop.dataset.over;
    const f = e.dataTransfer?.files?.[0];
    if (f) load(f);
  });
  modalitySel.addEventListener('change', () => file && image && runChecks());
  exampleBtn.addEventListener('click', showExample);
  analyseBtn.addEventListener('click', analyse);

  async function load(f: File) {
    file = f;
    results.hidden = true;
    say('');
    image = null;
    if (['image/jpeg', 'image/png'].includes(f.type) && f.size <= 10 * 1024 * 1024) {
      const url = URL.createObjectURL(f);
      image = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    runChecks();
  }

  function stats(img: HTMLImageElement) {
    const w = Math.min(512, img.naturalWidth);
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < w * h; i++) {
      const g = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      gray[i] = g;
      sum += g;
    }
    const mean = sum / (w * h);
    let sq = 0;
    for (let i = 0; i < gray.length; i++) sq += (gray[i] - mean) ** 2;
    const std = Math.sqrt(sq / gray.length);
    // Variance of the Laplacian: low values mean a blurred image.
    let lsum = 0, lsq = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const l = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
        lsum += l;
        lsq += l * l;
        n++;
      }
    }
    const lap = n ? lsq / n - (lsum / n) ** 2 : 0;
    return { mean, std, lap };
  }

  function runChecks() {
    const modality = modalitySel.value;
    const rows: [string, Status][] = [];
    const okFormat = Boolean(file && ['image/jpeg', 'image/png'].includes(file.type) && file.size <= 10 * 1024 * 1024 && image);
    rows.push(['format', okFormat ? 'pass' : 'fail']);
    if (image) {
      const w = image.naturalWidth, h = image.naturalHeight;
      const minW = modality === 'panoramic' ? 1000 : 400;
      rows.push(['size', w >= minW && h >= 300 ? 'pass' : 'fail']);
      if (modality === 'panoramic') {
        const r = w / h;
        rows.push(['shape', r >= 1.5 && r <= 3.5 ? 'pass' : 'fail']);
      }
      const s = stats(image);
      rows.push(['exposure', s.mean >= 40 && s.mean <= 215 ? 'pass' : 'warn']);
      rows.push(['contrast', s.std >= 30 ? 'pass' : 'warn']);
      rows.push(['sharp', s.lap >= 40 ? 'pass' : 'warn']);
      drawPreview([]);
    } else {
      previewWrap.hidden = true;
    }
    checksList.replaceChildren(
      ...rows.map(([key, st]) => {
        const li = document.createElement('li');
        li.dataset.status = st;
        const chip = document.createElement('span');
        chip.className = `chip chip-${st}`;
        chip.textContent = t[st];
        const label = document.createElement('span');
        label.textContent = t.checks[key];
        li.append(chip, label);
        return li;
      }),
    );
    checksBox.hidden = false;
    const failed = rows.some(([, s]) => s === 'fail');
    const warned = rows.some(([, s]) => s === 'warn');
    verdict.textContent = failed ? t.blocked : warned ? t.warned : '';
    verdict.hidden = !verdict.textContent;
    verdict.dataset.kind = failed ? 'error' : 'warn';
    analyseBtn.disabled = failed;
    analyseBtn.hidden = false;
  }

  function drawPreview(overlays: Overlay[]) {
    if (!image) return;
    const maxW = 1400;
    const scale = Math.min(1, maxW / image.naturalWidth);
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const r = Math.max(10, canvas.width * 0.014);
    ctx.lineWidth = Math.max(2, r / 4);
    ctx.font = `700 ${Math.round(r * 1.1)}px Inter, sans-serif`;
    for (const o of overlays) {
      const x = (o.x / 100) * canvas.width;
      const y = (o.y / 100) * canvas.height;
      ctx.strokeStyle = o.color;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
      ctx.stroke();
      const label = o.tooth;
      const tw = ctx.measureText(label).width + r;
      ctx.fillStyle = o.color;
      ctx.fillRect(x + r * 1.7, y - r * 2.4, tw, r * 1.6);
      ctx.fillStyle = '#071633';
      ctx.fillText(label, x + r * 2.2, y - r * 1.2);
    }
    previewWrap.hidden = false;
  }

  async function analyse() {
    if (!file) return;
    if (!api) {
      say(t.noApi);
      return;
    }
    analyseBtn.disabled = true;
    analyseBtn.textContent = t.analysing;
    say('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('modality', modalitySel.value);
      const res = await fetch(`${api}/v1/xray/analyze`, { method: 'POST', body, signal: AbortSignal.timeout(45_000) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.result) {
        drawPreview(data.result.overlays ?? []);
        renderClusters(data.result.clusters ?? [], false);
      } else if (data?.error?.code === 'model_not_connected') {
        say(t.notConnected);
      } else if (res.status === 429) {
        say(t.rate, 'error');
      } else {
        say(t.failed, 'error');
      }
    } catch {
      say(t.failed, 'error');
    } finally {
      analyseBtn.disabled = false;
      analyseBtn.textContent = t.analyse;
    }
  }

  function showExample() {
    previewWrap.hidden = true; // the example is not about the user's image
    renderClusters(example, true);
    results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  const ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const el = (tag: string, cls?: string, text?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const human = (map: Record<string, string>, key: string) => map[key] ?? key.replace(/_/g, ' ');

  function renderClusters(clusters: Cluster[], isExample: boolean) {
    resultsTitle.textContent = isExample ? t.exampleTitle : t.resultTitle;
    resultsNote.textContent = isExample ? t.exampleNote : t.yourImage;
    exampleFigure.hidden = !isExample;
    const sorted = [...clusters].sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));
    if (sorted.length === 0) {
      clustersBox.replaceChildren(el('p', 'muted', t.noFindings));
    } else {
      clustersBox.replaceChildren(
        ...sorted.map((c) => {
          const card = el('article', 'cluster card');
          const head = el('div', 'c-head');
          const tooth = el('span', 'c-tooth', c.tooth_fdi);
          tooth.dir = 'ltr';
          tooth.setAttribute('aria-label', `${t.tooth} ${c.tooth_fdi}`);
          const titles = el('div');
          titles.append(el('h3', '', human(t.patterns, c.pattern)));
          const meta = el('div', 'c-meta');
          meta.append(el('span', `sev sev-${c.severity.toLowerCase()}`, human(t.severity, c.severity)), el('span', 'muted', human(t.urgency, c.urgency)));
          titles.append(meta);
          head.append(tooth, titles);
          card.append(head);
          const fl = el('ul', 'c-findings');
          for (const f of c.findings) fl.append(el('li', '', `${human(t.classes, f.class_name)} · ${nf.format(f.confidence)} ${t.confidence}`));
          card.append(fl);
          const options = c.prompts?.options ?? [];
          if (options.length) {
            card.append(el('h4', '', t.consider));
            const ol = el('ol', 'c-list');
            for (const o of [...options].sort((a, b) => a.rank - b.rank).slice(0, 3)) ol.append(el('li', '', o.text));
            card.append(ol);
          }
          const tests = c.prompts?.tests ?? [];
          if (tests.length) {
            card.append(el('h4', '', t.tests));
            const ul = el('ul', 'c-list');
            for (const x of tests.slice(0, 3)) ul.append(el('li', '', x));
            card.append(ul);
          }
          return card;
        }),
      );
    }
    results.hidden = false;
  }
}

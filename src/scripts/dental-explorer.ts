// Coordinates and findings belong to the synthetic image, not inference output.
for (const root of document.querySelectorAll<HTMLElement>('[data-dental-explorer]')) {
  const get = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const markers = [...root.querySelectorAll<SVGGElement>('[data-marker]')];
  const chips = [...root.querySelectorAll<HTMLButtonElement>('[data-finding]')];
  const details = [...root.querySelectorAll<HTMLElement>('[data-detail]')];
  const tour = get<HTMLButtonElement>('[data-tour]');
  const annotations = get<HTMLButtonElement>('[data-annotations]');
  const overlay = get<SVGGElement>('[data-overlay]');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let active = 0;
  let playing = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const setAnnotations = (show: boolean) => {
    annotations.setAttribute('aria-pressed', String(show));
    overlay.toggleAttribute('hidden', !show);
  };
  const select = (index: number) => {
    active = index;
    const marker = markers[index];
    const color = marker.dataset.color!;
    const x = Number(marker.dataset.x), y = Number(marker.dataset.y);
    const above = y < 180, labelX = x < 340 ? 238 : 438;
    root.style.setProperty('--finding-color', color);
    markers.forEach((item, i) => {
      const selected = i === index;
      item.setAttribute('aria-pressed', String(selected));
      const ring = item.querySelector('[data-ring]')!;
      ring.setAttribute('r', selected ? '25' : '19');
      ring.setAttribute('fill-opacity', selected ? '.08' : '.02');
      ring.setAttribute('stroke-width', selected ? '1.5' : '1');
      ring.setAttribute('stroke-opacity', selected ? '.9' : '.5');
      ring.setAttribute('stroke-dasharray', selected ? '' : '3 4');
    });
    chips.forEach((chip, i) => chip.setAttribute('aria-pressed', String(i === index)));
    details.forEach((detail, i) => detail.hidden = i !== index);
    const leader = get<SVGPathElement>('[data-leader]');
    leader.setAttribute('d', `M${x} ${above ? y - 26 : y + 26}V${above ? 38 : 337}H${labelX}`);
    leader.setAttribute('stroke', color);
    const box = get<SVGRectElement>('[data-label-box]');
    box.setAttribute('x', String(labelX - 67));
    box.setAttribute('y', above ? '24' : '325');
    box.setAttribute('stroke', color);
    const label = get<SVGTextElement>('[data-label]');
    label.setAttribute('x', String(labelX));
    label.setAttribute('y', above ? '41' : '342');
    label.setAttribute('fill', color);
    label.textContent = `${root.dataset.tooth} ${marker.dataset.tooth} · ${root.dataset.selected}`;
  };
  const setPlaying = (value: boolean) => {
    playing = value;
    if (timer) clearInterval(timer);
    timer = undefined;
    tour.setAttribute('aria-pressed', String(value));
    tour.setAttribute('aria-label', (value ? root.dataset.pause : root.dataset.play)!);
    get<HTMLElement>('[data-play-icon]').hidden = value;
    get<HTMLElement>('[data-pause-icon]').hidden = !value;
    get<SVGGElement>('[data-scan]').toggleAttribute('hidden', !value || media.matches);
    get<HTMLElement>('[data-details]').setAttribute('aria-live', value ? 'off' : 'polite');
    if (value) timer = setInterval(() => select((active + 1) % markers.length), 6000);
  };
  const choose = (index: number) => { setPlaying(false); setAnnotations(true); select(index); };
  chips.forEach((chip, i) => chip.addEventListener('click', () => choose(i)));
  markers.forEach((marker, i) => {
    marker.addEventListener('click', () => choose(i));
    marker.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(i); }
    });
  });
  annotations.addEventListener('click', () => setAnnotations(annotations.getAttribute('aria-pressed') !== 'true'));
  tour.addEventListener('click', () => setPlaying(!playing));
  const updateMotion = () => { if (media.matches) setPlaying(false); };
  media.addEventListener('change', updateMotion);
  setPlaying(!media.matches);
  window.addEventListener('pagehide', () => { setPlaying(false); media.removeEventListener('change', updateMotion); }, { once: true });
}

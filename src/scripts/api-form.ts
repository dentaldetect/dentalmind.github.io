// Submits any <form data-api="https://.../v1/..."> as JSON and shows the outcome in its [data-status] element.
// Messages come from data-msg-* attributes so the same script serves every form and language.
const started = performance.now();

function show(form: HTMLFormElement, kind: 'ok' | 'error' | 'busy', text: string) {
  const el = form.querySelector<HTMLElement>('[data-status]');
  if (!el) return;
  el.hidden = false;
  el.dataset.kind = kind;
  el.textContent = text;
}

for (const form of document.querySelectorAll<HTMLFormElement>('form[data-api]')) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = form.dataset;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const body: Record<string, unknown> = { elapsedMs: Math.round(performance.now() - started), ...JSON.parse(msg.extra || '{}') };
    for (const [key, value] of new FormData(form)) {
      if (form.querySelector(`[name="${key}"][type="checkbox"]`)) {
        const list = (body[key] as string[] | undefined) ?? [];
        list.push(String(value));
        body[key] = list;
      } else body[key] = value;
    }
    show(form, 'busy', msg.msgSending ?? '…');
    if (button) button.disabled = true;
    try {
      const res = await fetch(msg.api!, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const text = (data.status === 'confirmation_sent' && msg.msgSent) || (data.status === 'already_confirmed' && msg.msgAlready) || msg.msgSuccess || 'OK';
        show(form, 'ok', text);
        form.reset();
        return;
      }
      const code = data?.error?.code;
      show(form, 'error', (res.status === 429 && msg.msgRate) || (code === 'invalid_email' && msg.msgEmail) || (res.status === 422 && msg.msgInvalid) || msg.msgError || 'Error');
    } catch {
      show(form, 'error', msg.msgOffline ?? msg.msgError ?? 'Error');
    } finally {
      if (button) button.disabled = false;
    }
  });
}

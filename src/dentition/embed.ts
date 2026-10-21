// Standalone entry for the Android app (and any other host): a full-screen viewer that works offline.
//   index.html?lang=fa&theme=dark&tooth=36
// Selection is reported to `window.DentalMindAndroid.onSelect(fdi)` when the host provides that bridge;
// the host can call `window.dentition.select('36')` or `window.dentition.setStatus({...})`.
import { en } from '../i18n/en';
import { fa } from '../i18n/fa';
import { mountDentition, type DentitionHandle } from './app';
import './dentition.css';
import './embed.css';

interface AndroidBridge {
  onSelect(fdi: string): void;
  onReady?(): void;
  openUrl?(url: string): void;
}
declare global {
  interface Window {
    DentalMindAndroid?: AndroidBridge;
    dentition?: DentitionHandle;
  }
}

const q = new URLSearchParams(location.search);
const lang = q.get('lang') === 'fa' ? 'fa' : 'en';
const theme = q.get('theme');
document.documentElement.lang = lang;
document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;

const strings = (lang === 'fa' ? fa : en).dentition;
const bridge = window.DentalMindAndroid;
const root = document.getElementById('app')!;
root.classList.add('dm3d-embed');
const handle = mountDentition(root, {
  lang,
  strings,
  modelUrl: 'dentition.glb',
  licenseUrl: q.get('licenseUrl') ?? 'https://dentaldetect.github.io/dentalmind.github.io/dentition/#about-model',
  initial: q.get('tooth'),
  onSelect: (fdi) => bridge?.onSelect(fdi ?? ''),
});
window.dentition = handle;
handle.ready.then(() => bridge?.onReady?.()).catch(() => {});
// Links (the licence) open outside the viewer.
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a');
  if (a && bridge?.openUrl) {
    e.preventDefault();
    bridge.openUrl(a.href);
  }
});

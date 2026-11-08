// Gemeinsame Bausteine der Oberfläche.

import { html, useEffect, useState } from './vendor/preact-htm.js';

// Pixel-Icons als Zeichenkarten: x = volle Farbe, o = halbtransparent.
// Gefärbt wird über currentColor, damit aktive Tabs einfach die Textfarbe wechseln.
const ICONS = {
  welt: [
    '..xxxxx..',
    '.x...oxx.',
    '.....o.x.',
    '....o..x.',
    '...o.....',
    '..o......',
    '.o.......',
    'o........',
    '.........',
  ],
  heute: [
    '....x....',
    '.x.....x.',
    '...xxx...',
    '..xxxxx..',
    'x.xxxxx.x',
    '..xxxxx..',
    '...xxx...',
    '.x.....x.',
    '....x....',
  ],
  kalender: [
    '.x.....x.',
    'xxxxxxxxx',
    'xxxxxxxxx',
    'x.......x',
    'x.o.o.o.x',
    'x.......x',
    'x.o.o.o.x',
    'x.......x',
    'xxxxxxxxx',
  ],
  ideen: [
    '.........',
    '.xxxxxxx.',
    'x.......x',
    'xxxxxxxxx',
    'x...o...x',
    'x..ooo..x',
    'x.......x',
    'xxxxxxxxx',
    '.........',
  ],
  daten: [
    '....x....',
    '.x.xxx.x.',
    '..xxxxx..',
    '.xxx.xxx.',
    'xxx...xxx',
    '.xxx.xxx.',
    '..xxxxx..',
    '.x.xxx.x.',
    '....x....',
  ],
  flamme: [
    '...x...',
    '..xx...',
    '..xxx.x',
    '.xxxxxx',
    '.xxoxxx',
    'xxoooxx',
    'xxoooxx',
    '.xxoxx.',
    '..xxx..',
  ],
};

export function Icon({ name, scale = 3, title }) {
  const map = ICONS[name];
  const w = map[0].length;
  const h = map.length;
  const rects = [];
  map.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '.') return;
    rects.push(html`<rect x=${x} y=${y} width="1" height="1" opacity=${c === 'o' ? 0.45 : 1} />`);
  }));
  return html`<svg class="px" viewBox="0 0 ${w} ${h}" width=${w * scale} height=${h * scale}
    fill="currentColor" role=${title ? 'img' : 'presentation'} aria-label=${title}>${rects}</svg>`;
}

// Vorschaubild aus einem Blob; die Objekt-URL wird beim Entfernen wieder freigegeben.
export function BlobImage({ blob, alt = '' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) return undefined;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? html`<img src=${url} alt=${alt} />` : null;
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const formatNumber = (n) => Number(n).toLocaleString('de-DE');

// Bottom-Sheet über allem; Tipp daneben oder Escape schließt.
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return html`
    <div class="sheet-backdrop" onClick=${onClose}>
      <div class="sheet panel" role="dialog" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
        <h2 class="label">${title}</h2>
        ${children}
      </div>
    </div>`;
}

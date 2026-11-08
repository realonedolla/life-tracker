// Pixel-Grundlagen: Canvas in niedriger Auflösung, scharf hochskaliert, plus Sprites.

import { html, useEffect, useRef } from './vendor/preact-htm.js';

// Ein Kunst-Pixel = P CSS-Pixel.
export const P = 3;

// Deterministisches Rauschen 0–1, damit Gestein bei jedem Zeichnen gleich aussieht.
export function hash(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Canvas, das sein Elternelement füllt. draw(ctx, w, h) arbeitet in Kunst-Pixeln.
export function PixelCanvas({ draw, deps = [] }) {
  const ref = useRef(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const paint = () => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = Math.ceil(parent.clientWidth / P);
    const h = Math.ceil(parent.clientHeight / P);
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    canvas.style.width = `${w * P}px`;
    canvas.style.height = `${h * P}px`;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    drawRef.current(ctx, w, h);
  };

  useEffect(() => {
    const ro = new ResizeObserver(paint);
    ro.observe(ref.current.parentElement);
    return () => ro.disconnect();
  }, []);
  useEffect(paint, deps);

  return html`<canvas class="pixel-bg" ref=${ref} aria-hidden="true"></canvas>`;
}

export function px(ctx, x, y, color, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Zeichnet eine Zeichenkarte; '.' ist durchsichtig.
export function sprite(ctx, rows, palette, x, y, { alpha = 1, mask = null } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  rows.forEach((row, sy) => {
    for (let sx = 0; sx < row.length; sx++) {
      const c = row[sx];
      if (c === '.' || !palette[c]) continue;
      if (mask && mask(sx, sy)) continue;
      ctx.fillStyle = palette[c];
      ctx.fillRect(x + sx, y + sy, 1, 1);
    }
  });
  ctx.restore();
}

// Weiches Leuchten aus Pixel-Ringen.
export function glow(ctx, cx, cy, radius, color, strength = 0.22) {
  ctx.save();
  ctx.fillStyle = color;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > radius) continue;
      ctx.globalAlpha = strength * (1 - d / radius);
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  ctx.restore();
}

// ---------- Sprites ----------

export const SPRITES = {
  digger: [
    '...yyyy...',
    '..yyyyyyL.',
    '...ssss...',
    '...ssse...',
    '...ssss.gg',
    '..bbbbbbhg',
    '.sbbbbbh..',
    '..bbbbh...',
    '..pppp....',
    '..pp.pp...',
    '..pp.pp...',
    '..kk.kk...',
  ],
  diggerSwing: [
    '...yyyy.gg',
    '..yyyyyyLg',
    '...ssss.h.',
    '...ssseh..',
    '...ssssh..',
    '..bbbbbs..',
    '.sbbbbb...',
    '..bbbbb...',
    '..pppp....',
    '..pp.pp...',
    '..pp.pp...',
    '..kk.kk...',
  ],
  lantern: [
    '...m...',
    '..mmm..',
    '.mgggm.',
    '.mgGgm.',
    '.mgggm.',
    '..mmm..',
    '...w...',
    '...w...',
    '...w...',
    '...w...',
    '...w...',
    '...w...',
    '..www..',
    '.wwwww.',
  ],
  chest: [
    '.ooooooooo.',
    'oGGGGGGGGGo',
    'oGgggggggGo',
    'ooooolooooo',
    'oBBBBlBBBBo',
    'oBbbbbbbbBo',
    'oBbbbbbbbBo',
    'ooooooooooo',
  ],
  smallChest: [
    '.ooooo.',
    'oGGGGGo',
    'ooolooo',
    'oBBlBBo',
    'oBbbbBo',
    'ooooooo',
  ],
  ore: [
    '..xxx..',
    '.xyxxx.',
    'xxxxyxx',
    'xyxxxxx',
    '.xxxyx.',
    '..xxx..',
  ],
  crystal: [
    '..c..',
    '.cCc.',
    '.cwC.',
    'ccCCc',
    '.cCc.',
    '.cCc.',
    '..c..',
  ],
  torch: [
    '.f.',
    'fFf',
    '.F.',
    '.k.',
    '.k.',
  ],
  sun: [
    '..yyy..',
    '.yYYYy.',
    'yYYYYYy',
    'yYYYYYy',
    'yYYYYYy',
    '.yYYYy.',
    '..yyy..',
  ],
  moon: [
    '.mmmm.',
    'mmdmmm',
    'mmmmdm',
    'mdmmmm',
    'mmmmmm',
    '.mmmm.',
  ],
  cloud: [
    '....wwww.....',
    '..wwwwwwww...',
    '.wwwwwwwwwww.',
    'wwwwwwwwwwwww',
    '.ssssssssss..',
  ],
};

// ---------- Garten ----------

export const GARDEN = {
  flower: ['.p.p.', 'ppcpp', '.ppp.', '..s..', '.ss..', '..s..'],
  flowerWilt: ['.....', '..pp.', '.pcp.', '..s..', '..s..', '..s..'],
  bush: ['.gGg..', 'gGgGg.', 'GgGgGg', 'gGgGgG', '.gggg.'],
  bushWilt: ['......', '.bwb..', 'wbwbw.', 'bwbwbw', '.bbbb.'],
  mushroom: ['.rrr.', 'rwrwr', 'rrrrr', '.ww..', '.ww..'],
  mushroomWilt: ['.....', '.....', '.bbb.', 'bwbwb', '.ww..'],
  grass: ['g...g', 'g.g.g', '.ggg.', '.ggg.', 'gGgGg'],
  grassWilt: ['.....', 'b...b', 'b.b.b', '.bbb.', 'bwbwb'],
  weed: ['k.k.k', '.kkk.', 'kKkKk', '.kKk.', 'kkkkk', '.k.k.'],
  bench: ['kwwwwwwwwk', 'k........k', 'kwwwwwwwwk', 'kWWWWWWWWk', 'k.k....k.k', 'k.k....k.k'],
  lamp: ['.mmm.', 'mgggm', 'mgGgm', 'mgggm', '.mmm.', '..m..', '..m..', '..m..', '..m..', '..m..', '..m..', '..m..', '..m..', '..m..', '.mmm.', 'mmmmm'],
  fountain: [
    '.......b.......', '......bBb......', '.......b.......', '......sss......', '......sSs......',
    '.b....sss....b.', 'sbbbbbbbbbbbbbs', 'sBBBBBBBBBBBBBs', 'sssssssssssssss', '.SSSSSSSSSSSSS.',
  ],
  hut: [
    '......rr......', '.....rrrr.....', '....rRRrrr....', '...rrrrRRrr...', '..rrRRrrrrrr..', '.rrrrrrrRRrrr.', 'rrrrrrrrrrrrrr',
    '.wwwwwwwwwwww.', '.wWWWWwwyyyww.', '.wWddWwwyyyww.', '.wWddWwwwwwww.', '.wWddWwwwwwww.', '.wWddWwwwwwww.', '.wwwwwwwwwwww.',
  ],
  statue: [
    'g.......g', 'g..ggg..g', '.g.gGg.g.', '..ggggg..', '...gGg...', '...ggg...', '...g.g...', '...g.g...', '..gg.gg..',
    'sssssssss', '.SSSSSSS.', '.SSSSSSS.', 'sssssssss',
  ],
};

export const GARDEN_PAL = {
  plant: { s: '#3e8948', g: '#63c74d', G: '#3e8948', w: '#f3ecdc', r: '#d8453a', c: '#ffe066' },
  wilt: { p: '#8a6a3a', c: '#6b4a2a', s: '#7a6a3a', b: '#7a5a32', w: '#5a4228' },
  weed: { k: '#2f4f2a', K: '#4a6a2a' },
  bench: { k: '#2b2b38', w: '#a0703f', W: '#7a4f2a' },
  lamp: { m: '#2b2b38', g: '#ffd25a', G: '#fff2b0' },
  lampOff: { m: '#2b2b38', g: '#4a5266', G: '#5a6276' },
  fountain: { b: '#6cc8f0', B: '#3a9ad0', s: '#a8adb8', S: '#7d838e' },
  fountainDry: { b: 'transparent', B: '#6b5a44', s: '#a8adb8', S: '#7d838e' },
  hut: { r: '#b5443a', R: '#8a2f28', w: '#c8a070', W: '#7a4f2a', d: '#5a3518', y: '#ffd25a' },
  statue: { g: '#e8b830', G: '#b98a18', s: '#a8adb8', S: '#7d838e' },
};

// Blütenfarben, die sich von Tag zu Tag abwechseln.
export const PETALS = ['#ff7eb6', '#ffd25a', '#b38cff', '#ff8a5c', '#ffffff', '#7ec8ff'];

export const PAL = {
  digger: { y: '#f4c430', L: '#fff6a0', s: '#f0c39a', e: '#2a1a10', b: '#3f6fd0', p: '#6b4a2a', k: '#2a1e1a', g: '#a8acb8', h: '#8a5a32' },
  lanternLit: { m: '#2b2b38', g: '#ffd25a', G: '#fff2b0', w: '#6b4226' },
  lanternOff: { m: '#2b2b38', g: '#3a4152', G: '#4a5266', w: '#6b4226' },
  chest: { o: '#2a1a08', G: '#f4c430', g: '#c8961e', l: '#ffe066', B: '#8a5a32', b: '#6b4226' },
  ore: { x: '#6d6a75', y: '#f4c430' },
  crystal: { c: '#7ee8fa', C: '#2ca0c8', w: '#ffffff' },
  torch: { f: '#ffe066', F: '#f08a2a', k: '#6b4226' },
  sun: { y: '#ffb000', Y: '#ffe066' },
  moon: { m: '#e8e4d0', d: '#bdb8a3' },
};

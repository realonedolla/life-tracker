// Der Gräber: Aussehen (selbst gewählt), Ausrüstung (durch Leistung) und Begleiter.
// Zeichnet groß (Profil) und klein (Welt, Freunde).

import { glow, sprite } from './pixel.js';

// ---------- Aussehen ----------

export const SKINS = ['#f6d5b8', '#f0c39a', '#d9a27a', '#b07a52', '#7a5236', '#4e3424'];
export const HAIRS = ['#2a1a10', '#5a3a22', '#a0703f', '#e8c070', '#c4542e', '#e8e8e8', '#3a5aa8'];
export const SHIRTS = ['#3f6fd0', '#d8453a', '#3e8948', '#8a5cc4', '#f08a2a', '#2b2b38', '#e8e0d0', '#ff7eb6'];

export const DEFAULT_LOOK = { name: 'Gräber', skin: SKINS[1], hair: HAIRS[1], shirt: SHIRTS[0] };

// ---------- Ausrüstung: jede Stufe hängt an einem echten Wert ----------

export const GEAR = {
  pick: {
    label: 'Spitzhacke', stat: 'totalHours', unit: 'h Arbeit',
    tiers: [
      { at: 0, name: 'Holz-Hacke', color: '#a0703f' },
      { at: 5, name: 'Stein-Hacke', color: '#8a8f9a' },
      { at: 25, name: 'Eisen-Hacke', color: '#d8dde6' },
      { at: 75, name: 'Gold-Hacke', color: '#f4c430' },
      { at: 200, name: 'Diamant-Hacke', color: '#7ee8fa' },
      { at: 500, name: 'Obsidian-Hacke', color: '#7a4fb0' },
    ],
  },
  helmet: {
    label: 'Helm', stat: 'longestStreak', unit: 'Tage Streak (Rekord)',
    tiers: [
      { at: 0, name: 'Stoffkappe', color: '#6b4a2a' },
      { at: 3, name: 'Grubenhelm', color: '#f4c430' },
      { at: 7, name: 'Stahlhelm', color: '#a8adb8' },
      { at: 14, name: 'Goldhelm', color: '#e8a820' },
      { at: 30, name: 'Kristallhelm', color: '#7ee8fa' },
      { at: 60, name: 'Kronhelm', color: '#c9a8ff' },
    ],
  },
  lamp: {
    label: 'Lampe', stat: 'goldDays', unit: 'Gold-Tage',
    tiers: [
      { at: 0, name: 'Kerze', color: '#ffcf5a', radius: 4 },
      { at: 1, name: 'Öllampe', color: '#ffd25a', radius: 6 },
      { at: 5, name: 'Grubenlampe', color: '#fff2b0', radius: 8 },
      { at: 15, name: 'Kristalllampe', color: '#bdf6ff', radius: 10 },
      { at: 40, name: 'Sonnenstein', color: '#fff6a0', radius: 13 },
    ],
  },
  pack: {
    label: 'Rucksack', stat: 'finds', unit: 'Funde',
    tiers: [
      { at: 0, name: 'Kein Rucksack', color: null },
      { at: 1, name: 'Lederbeutel', color: '#8a6a3a' },
      { at: 5, name: 'Rucksack', color: '#6b4226' },
      { at: 12, name: 'Expeditionsrucksack', color: '#3e8948' },
      { at: 25, name: 'Schatzrucksack', color: '#c8961e' },
    ],
  },
  boots: {
    label: 'Stiefel', stat: 'waterFullDays', unit: 'Tage Wasser voll',
    tiers: [
      { at: 0, name: 'Sandalen', color: '#8a6a3a' },
      { at: 7, name: 'Lederstiefel', color: '#5a3518' },
      { at: 21, name: 'Wanderstiefel', color: '#3a3a4a' },
      { at: 50, name: 'Wasserläufer', color: '#2ca0c8' },
    ],
  },
  pet: {
    label: 'Begleiter', stat: 'longestStreak', unit: 'Tage Streak (Rekord)',
    tiers: [
      { at: 0, name: 'Noch keiner', color: null },
      { at: 7, name: 'Maulwurf', color: '#5a4a4a' },
      { at: 14, name: 'Katze', color: '#e8a050' },
      { at: 30, name: 'Glühwürmchen', color: '#d8ff6a' },
      { at: 60, name: 'Kleiner Drache', color: '#63c74d' },
    ],
  },
};
export const GEAR_SLOTS = ['pick', 'helmet', 'lamp', 'pack', 'boots', 'pet'];

// Stufe eines Slots zu einem Wert, dazu die nächste Stufe.
export function gearTier(slot, value) {
  const tiers = GEAR[slot].tiers;
  let i = 0;
  while (i + 1 < tiers.length && value >= tiers[i + 1].at) i++;
  return { index: i, tier: tiers[i], next: tiers[i + 1] || null, value };
}

// ---------- Hilfsfarben ----------

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ---------- Großer Gräber (Profil) ----------

const BIG = [
  '.....HHHHH......',
  '....HhhHHHH.LL..',
  '...HHHHHHHHHLL..',
  '..HHHHHHHHHHH...',
  '....RSSSSSR....X',
  '....RSSESSS...XX',
  '....RSSSSSs..XxX',
  '.....SSSSs..AXX.',
  '......SSS..A....',
  '...BBBBBBBA.....',
  '..BBBBBBBABS....',
  '.GBBbBBBABBS....',
  '.GBBbBBABBB.....',
  '.GBBbBABBBB.....',
  '.GBTTTATTTB.....',
  '...PPPAPPP......',
  '...PPAPPPP......',
  '...PPP.PPP......',
  '...PPP.PPP......',
  '...PPP.PPP......',
  '..KKKK.KKKK.....',
  '..KKKK.KKKK.....',
];
export const BIG_W = 16;
export const BIG_H = BIG.length;

export function bigPalette(look, gear) {
  const helmet = gear.helmet.tier.color;
  const pick = gear.pick.tier.color;
  return {
    H: helmet, h: shade(helmet, 0.45),
    L: gear.lamp.tier.color,
    R: look.hair, S: look.skin, s: shade(look.skin, -0.15), E: '#1a1010',
    B: look.shirt, b: shade(look.shirt, -0.25), T: '#3a2410',
    P: '#3a4a6a', K: gear.boots.tier.color,
    A: '#7a4f2a', X: pick, x: shade(pick, 0.55),
    G: gear.pack.tier.color || undefined,
  };
}

// Zeichnet den großen Gräber; frame wechselt fürs Atmen (1 px auf und ab).
export function drawBigDigger(ctx, x, y, look, gear, frame = 0) {
  const pal = bigPalette(look, gear);
  const lamp = gear.lamp.tier;
  const bob = frame % 2;
  glow(ctx, x + 12, y + 2 + bob, lamp.radius + (frame % 3 === 0 ? 1 : 0), lamp.color, 0.28);
  sprite(ctx, BIG, pal, x, y + bob);
}

// ---------- Kleiner Gräber (Welt, Freunde) ----------

// Palette für SPRITES.digger / diggerSwing aus pixel.js.
export function smallPalette(look, gear) {
  return {
    y: gear.helmet.tier.color, L: gear.lamp.tier.color, s: look.skin, e: '#2a1a10',
    b: look.shirt, p: '#3a4a6a', k: gear.boots.tier.color, g: gear.pick.tier.color, h: '#8a5a32',
  };
}

// ---------- Begleiter ----------

const PETS = {
  1: { map: ['..mmmm..', '.mmmmmm.', 'mmEmmmmn', '.mmmmmm.', '.c.c.c.c'], pal: { m: '#5a4a4a', E: '#000', n: '#ff9aa8', c: '#e8d0b0' } },
  2: { map: ['m.....m.', 'mm...mm.', 'mmmmmmm.', 'mEmmEmm.', 'mmmnmmm.', '.mmmmm.t', '.m...mtt'], pal: { m: '#e8a050', E: '#1a1010', n: '#ff9aa8', t: '#c87830' } },
  3: { map: ['.f...f.', '...f...', 'f.....f'], pal: { f: '#d8ff6a' }, glow: '#d8ff6a' },
  4: { map: ['..www.....', '.wddw...dd', 'dEddd..ddd', 'dddddddddw', '.dddddddd.', '.d.d..d.d.'], pal: { d: '#63c74d', E: '#1a1010', w: '#3e8948' } },
};

export function drawPet(ctx, x, y, gear, frame = 0) {
  const pet = PETS[gear.pet.index];
  if (!pet) return;
  const dy = gear.pet.index === 3 ? (frame % 2 ? -1 : 1) : (frame % 4 === 0 ? -1 : 0);
  if (pet.glow) pet.map.forEach((row, ry) => [...row].forEach((c, rx) => { if (c === 'f') glow(ctx, x + rx, y + ry + dy, 3, pet.glow, 0.3); }));
  sprite(ctx, pet.map, pet.pal, x, y - pet.map.length + dy);
}

// ---------- Gegenstände im Inventar ----------

const ICONS = {
  pick: ['.XXXXX..', 'X....XA.', '.....A..', '....A...', '...A....', '..A.....', '.A......', 'A.......'],
  helmet: ['........', '..HHHH.L', '.HhHHHHL', '.HHHHHH.', 'HHHHHHHH', '........'],
  lamp: ['..MM..', '.MLLM.', '.MLLM.', '.MLLM.', '..MM..', '..MM..'],
  pack: ['.GGGG.', 'GgGGgG', 'GGGGGG', 'GGTTGG', 'GGGGGG', '.GGGG.'],
  boots: ['KK...KK', 'KK...KK', 'KK...KK', 'KKK..KKK', 'KKKK.KKKK'],
};

// Zeichnet ein Inventar-Symbol mittig in einen w×h großen Canvas; locked = Silhouette.
export function drawItemIcon(ctx, w, h, slot, tier, locked = false) {
  ctx.clearRect(0, 0, w, h);
  if (slot === 'pet') {
    const fake = { pet: { index: GEAR.pet.tiers.indexOf(tier) } };
    if (locked || !PETS[fake.pet.index]) {
      sprite(ctx, ['..mmmm..', '.mmmmmm.', 'mmmmmmmm', '.mmmmmm.'], { m: '#3a3350' }, (w - 8) >> 1, (h - 4) >> 1);
      return;
    }
    const map = PETS[fake.pet.index].map;
    drawPet(ctx, (w - map[0].length) >> 1, ((h + map.length) >> 1), fake, 0);
    return;
  }
  const map = ICONS[slot];
  const c = locked ? '#3a3350' : tier.color || '#3a3350';
  const pal = {
    X: c, x: shade(c, 0.5), A: locked ? '#2e2745' : '#7a4f2a',
    H: c, h: shade(c, 0.45), L: locked ? '#2e2745' : slot === 'lamp' ? c : '#fff6a0',
    M: locked ? '#2e2745' : '#2b2b38', G: c, g: shade(c, 0.3), T: locked ? '#2e2745' : '#3a2410', K: c,
  };
  const ox = (w - Math.max(...map.map((r) => r.length))) >> 1;
  const oy = (h - map.length) >> 1;
  if (slot === 'lamp' && !locked) glow(ctx, ox + 3, oy + 2, Math.min(5, tier.radius / 2 + 2), c, 0.3);
  sprite(ctx, map, pal, ox, oy);
}

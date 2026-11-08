// Zeichnet die Welt in Kunst-Pixeln: Himmel, Wiese, Gesteinsschichten, Tunnel, Krug.
// Alle Funktionen sind rein: gleiche Eingaben → gleiches Bild.

import { GARDEN, GARDEN_PAL, PAL, PETALS, SPRITES, glow, hash, px, sprite } from './pixel.js';
import { rgb } from './sun.js';

// ---------- Himmel ----------

// Der Himmel wird ab dem Horizont (Graskante) nach oben gemessen, damit Himmel-
// und Wiesen-Canvas ohne Absprache nahtlos aneinanderpassen.
const SKY_FADE = 130;  // so hoch läuft der Farbverlauf
const SKY_BANDS = 14;  // Farbstufen statt weichem Verlauf
const ARC = 26;        // Scheitelhöhe der Sonnenbahn: bleibt im freien Himmel unter den Karten

const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function skyColorAt(sky, d) {
  const t = Math.min(1, Math.max(0, d / SKY_FADE));
  return rgb(lerp(sky.bottom, sky.top, Math.floor(t * SKY_BANDS) / SKY_BANDS));
}

// horizon: y-Koordinate der Graskante in diesem Canvas (kann außerhalb liegen).
export function drawSky(ctx, w, h, sky, horizon) {
  for (let y = 0; y < h; y++) px(ctx, 0, y, skyColorAt(sky, horizon - y), w, 1);

  if (sky.stars > 0) {
    for (let y = 0; y < h; y++) {
      const d = horizon - y;
      if (d < 8) continue;
      for (let x = 0; x < w; x++) {
        const n = hash(x, d, 7);
        if (n < 0.006 * sky.stars) px(ctx, x, y, n < 0.002 ? '#ffffff' : '#c9d3ff');
      }
    }
  }

  // Wolken an festen Plätzen, Farbe je nach Tageszeit.
  const cloudColor = sky.stars > 0.6 ? { w: '#3a4470', s: '#2a3258' } : { w: rgb(lerp(sky.bottom, [255, 255, 255], 0.7)), s: rgb(lerp(sky.bottom, [255, 255, 255], 0.35)) };
  [[0.06, 30], [0.5, 38], [0.8, 24]].forEach(([fx, d]) => {
    sprite(ctx, SPRITES.cloud, cloudColor, Math.round(fx * w), horizon - d, { alpha: sky.stars > 0.6 ? 0.6 : 0.85 });
  });

  const body = sky.sun || sky.moon;
  if (body) {
    const x = Math.round(6 + body.f * (w - 19));
    const y = Math.round(horizon - 8 - Math.sin(Math.PI * body.f) * ARC);
    if (sky.sun) {
      glow(ctx, x + 3, y + 3, 9, '#fff3b0', 0.25);
      sprite(ctx, SPRITES.sun, PAL.sun, x, y);
    } else {
      glow(ctx, x + 3, y + 3, 7, '#c9d3ff', 0.15);
      sprite(ctx, SPRITES.moon, PAL.moon, x, y);
    }
  }
}

// ---------- Erde und Gestein ----------

export const LAYERS = {
  dirt:  { base: '#8a5a32', dark: '#6b4226', light: '#a0703f', speck: '#5a3518', tunnel: '#2a1d16', edge: '#4a3020' },
  stone: { base: '#6f7480', dark: '#5a5f6b', light: '#8a8f9a', speck: '#3f434d', tunnel: '#1d1f26', edge: '#3a3d47' },
  deep:  { base: '#4a2a6e', dark: '#3c2159', light: '#5e3888', speck: '#8a5cc4', tunnel: '#150d20', edge: '#2a1a3e' },
  bedrock: { base: '#221c2c', dark: '#1a1522', light: '#2e2638', speck: '#120e18', tunnel: '#000', edge: '#000' },
};

// Gesteinsstruktur; seed sorgt dafür, dass jede Schicht anders aussieht.
function fillRock(ctx, x0, y0, w, h, pal, seed) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const n = hash(x, y, seed);
      const blob = hash(x >> 2, y / 3 | 0, seed + 1);
      let c = pal.base;
      if (blob < 0.25) c = pal.dark;
      if (n < 0.05) c = pal.speck;
      else if (n > 0.95) c = pal.light;
      px(ctx, x, y, c);
    }
  }
}

// Gezackter Übergang von der darüberliegenden Schicht.
function jaggedTop(ctx, w, pal, seed, depth = 4) {
  for (let x = 0; x < w; x++) {
    const d = Math.floor(hash(x, 0, seed + 9) * depth);
    if (d) px(ctx, x, 0, pal.base, 1, d);
  }
}

// Schacht mit Leiter am linken Rand, verbindet Oberfläche und alle Schichten.
export const SHAFT = { x: 5, w: 9 };
function drawShaft(ctx, y0, h, pal) {
  px(ctx, SHAFT.x, y0, pal.tunnel, SHAFT.w, h);
  px(ctx, SHAFT.x - 1, y0, pal.edge, 1, h);
  px(ctx, SHAFT.x + SHAFT.w, y0, pal.edge, 1, h);
  px(ctx, SHAFT.x + 1, y0, '#6b4226', 1, h);
  px(ctx, SHAFT.x + SHAFT.w - 2, y0, '#6b4226', 1, h);
  for (let y = y0 + 1; y < y0 + h; y++) if (y % 4 === 0) px(ctx, SHAFT.x + 1, y, '#8a5a32', SHAFT.w - 2, 1);
}

// ---------- Wiese mit Garten ----------
//
// Von oben nach unten: Himmel · Hügelreihen mit Bauwerken (hinten) · Graskante mit
// Laternen · Beete mit Pflanzen (vorne, wachsen um Reihen) · Erde.

export const REF_W = 125;          // schmalstes iPhone; danach richtet sich die Höhe des Himmels
const HILL_ROW_H = 16;
const BED_ROW_H = 10;
const SLOT_W = 6;
const BED_X = SHAFT.x + SHAFT.w + 3;
const DIRT_H = 8;

const STRUCT_SIZE = {
  bench: [10, 6], lamp: [5, 16], fountain: [15, 10], hut: [14, 14], windmill: [15, 22], tower: [12, 26],
  statue: [9, 13], flagTower: [9, 20], crystalPillar: [9, 15],
};

// Bauwerke der Reihe nach auf Hügelreihen; volle Reihe → nächste Reihe weiter hinten.
function hillRows(structures) {
  const rows = [[]];
  let x = 18;
  for (const st of structures) {
    const [sw] = STRUCT_SIZE[st.sprite];
    if (x + sw > REF_W - 2 && rows.at(-1).length) {
      rows.push([]);
      x = 10 + (rows.length - 1) * 7;
    }
    rows.at(-1).push({ st, fx: x / REF_W });
    x += sw + 5;
  }
  return rows;
}

export const meadowSkyH = (garden) => 34 + (Math.max(1, hillRows(garden.structures).length) - 1) * HILL_ROW_H;

// Lage aller Dinge auf der Wiese; auch für die HTML-Knöpfe darüber.
export function meadowLayout(w, lanternCount, garden) {
  const skyH = meadowSkyH(garden);
  const perRow = Math.max(8, Math.floor((w - BED_X - 2) / SLOT_W));
  const items = garden.plants.length + garden.weeds;
  const bedRows = Math.max(1, Math.ceil(items / perRow));
  const bedTop = skyH + 3;
  const from = 44;
  const to = w - 6;
  const step = lanternCount > 1 ? (to - from) / (lanternCount - 1) : 0;
  const structures = hillRows(garden.structures).flatMap((row, r) => row.map(({ st, fx }) => {
    const [sw, sh] = STRUCT_SIZE[st.sprite];
    const baseY = skyH - 3 - r * HILL_ROW_H;
    return { st, row: r, x: Math.round(fx * w), y: baseY - sh, w: sw, h: sh, baseY };
  }));
  return {
    skyH, perRow, bedRows, bedTop, structures,
    h: bedTop + bedRows * BED_ROW_H + DIRT_H,
    entrance: 2, chestX: 28, diggerX: 17,
    lanterns: Array.from({ length: lanternCount }, (_, i) => Math.round(from + i * step) - 3),
    lanternY: skyH - 14,
  };
}

const lerpHex = (a, b, t) => {
  const pa = a.match(/\w\w/g).map((x) => parseInt(x, 16));
  return rgb(lerp(pa, b, t));
};

function drawStructure(ctx, st, x, baseY, { dry, night }) {
  const [sw, sh] = STRUCT_SIZE[st.sprite];
  const top = baseY - sh;
  switch (st.sprite) {
    case 'bench': sprite(ctx, GARDEN.bench, GARDEN_PAL.bench, x, top); break;
    case 'lamp':
      if (night) glow(ctx, x + 2, top + 2, 7, '#ffcf5a', 0.25);
      sprite(ctx, GARDEN.lamp, night ? GARDEN_PAL.lamp : GARDEN_PAL.lampOff, x, top);
      break;
    case 'fountain': sprite(ctx, GARDEN.fountain, dry ? GARDEN_PAL.fountainDry : GARDEN_PAL.fountain, x, top); break;
    case 'hut':
      sprite(ctx, GARDEN.hut, GARDEN_PAL.hut, x, top);
      if (night) glow(ctx, x + 10, top + 9, 4, '#ffd25a', 0.25);
      break;
    case 'statue':
      glow(ctx, x + 4, top + 4, 6, '#ffe066', 0.15);
      sprite(ctx, GARDEN.statue, GARDEN_PAL.statue, x, top);
      break;
    case 'windmill': {
      // Turm als Trapez, darüber vier Flügel.
      for (let i = 0; i < 13; i++) {
        const half = 2 + Math.floor(i / 4);
        px(ctx, x + 7 - half, top + 9 + i, '#d8c8a8', half * 2 + 1, 1);
        px(ctx, x + 7 + half, top + 9 + i, '#a89878');
      }
      px(ctx, x + 6, baseY - 4, '#5a3518', 3, 4);
      px(ctx, x + 6, top + 6, '#7a4f2a', 3, 4);
      for (let i = 1; i <= 6; i++) {
        px(ctx, x + 7 - i, top + 7 - i, '#f3ecdc'); px(ctx, x + 7 + i, top + 7 - i, '#f3ecdc');
        px(ctx, x + 7 - i, top + 7 + i, '#f3ecdc'); px(ctx, x + 7 + i, top + 7 + i, '#f3ecdc');
      }
      px(ctx, x + 7, top + 7, '#5a3518');
      break;
    }
    case 'tower':
      px(ctx, x + 1, top + 8, '#8a8f9a', 10, sh - 8);
      px(ctx, x + 1, top + 8, '#a8adb8', 2, sh - 8);
      for (let i = 0; i < 5; i++) px(ctx, x + 1 + i * 2, top + 6, '#8a8f9a', 1, 2);
      px(ctx, x + 1, top + 6, '#8a8f9a', 10, 1);
      px(ctx, x + 5, top + 12, night ? '#ffd25a' : '#2a2a35', 2, 3);
      px(ctx, x + 5, top + 19, night ? '#ffd25a' : '#2a2a35', 2, 3);
      px(ctx, x + 5, baseY - 4, '#5a3518', 2, 4);
      px(ctx, x + 6, top, '#2b2b38', 1, 6);
      px(ctx, x + 7, top, '#d8453a', 4, 3);
      break;
    case 'flagTower':
      px(ctx, x, baseY - 3, '#7d838e', 9, 3);
      px(ctx, x + 2, top + 5, '#a8adb8', 5, sh - 8);
      px(ctx, x + 2, top + 5, '#c8ccd4', 1, sh - 8);
      px(ctx, x + 3, top + 3, '#a8adb8', 3, 2);
      px(ctx, x + 4, top - 4, '#2b2b38', 1, 7);
      px(ctx, x + 5, top - 4, '#63c74d', 4, 3);
      break;
    case 'crystalPillar':
      px(ctx, x, baseY - 3, '#7d838e', 9, 3);
      glow(ctx, x + 4, top + 5, 7, '#b38cff', 0.25);
      sprite(ctx, ['..c..', '.cCc.', '.cwC.', 'ccCCc', 'cCCcC', '.cCc.', '.cCc.', 'cCcCc', '.cCc.', '..c..'],
        { c: '#c9a8ff', C: '#8a5cc4', w: '#ffffff' }, x + 2, top);
      sprite(ctx, ['.c.', 'cCc', 'cCc', '.c.'], { c: '#7ee8fa', C: '#2ca0c8' }, x, top + 6);
      sprite(ctx, ['.c.', 'cCc', 'cCc', '.c.'], { c: '#7ee8fa', C: '#2ca0c8' }, x + 6, top + 7);
      break;
    default:
      break;
  }
}

const PLANT_TYPES = ['flower', 'flower', 'bush', 'mushroom', 'grass', 'flower'];

function dayHash(date) {
  let h = 0;
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function drawMeadow(ctx, w, h, { sky, lanterns, digger, ideas, garden }) {
  const L = meadowLayout(w, lanterns.length, garden);
  const g = L.skyH;
  drawSky(ctx, w, g + 2, sky, g);
  const night = sky.stars > 0.5;

  // Hügelreihen von hinten nach vorn, hintere blasser (Luftperspektive).
  const rowsCount = Math.max(1, ...L.structures.map((s) => s.row + 1));
  for (let r = rowsCount - 1; r >= 0; r--) {
    const base = g - 3 - r * HILL_ROW_H;
    const color = lerpHex('#3f9a4a', sky.bottom, 0.25 + r * 0.2);
    for (let x = 0; x < w; x++) {
      const top = base - 1 - Math.round(Math.sin((x + r * 40) / 9) * 1.5 + 1.5);
      px(ctx, x, top, color, 1, g - top);
    }
    L.structures.filter((s) => s.row === r).forEach((s) => drawStructure(ctx, s.st, s.x, s.baseY, { dry: garden.fountainDry, night }));
  }

  // Graskante, Wiesengrund mit Beeten, Erde.
  px(ctx, 0, g, '#2f6b3a', w, L.bedTop + L.bedRows * BED_ROW_H - g);
  fillRock(ctx, 0, L.bedTop + L.bedRows * BED_ROW_H, w, DIRT_H, LAYERS.dirt, 3);
  for (let x = 0; x < w; x++) {
    const n = hash(x, 1, 5);
    px(ctx, x, g, n < 0.5 ? '#63c74d' : '#4fb043', 1, 2);
    px(ctx, x, g + 2, '#3e8948', 1, 1);
    if (n > 0.6) px(ctx, x, g - 1, '#63c74d');
    if (n > 0.9) px(ctx, x, g - 2, '#4fb043');
  }
  drawBeds(ctx, w, L, garden);

  // Mineneingang mit Holzrahmen über dem Schacht.
  drawShaft(ctx, g, h - g, LAYERS.dirt);
  const e = L.entrance;
  px(ctx, e + 1, g - 11, '#6b4226', 2, 11);
  px(ctx, e + 11, g - 11, '#6b4226', 2, 11);
  px(ctx, e, g - 12, '#8a5a32', 15, 2);
  px(ctx, e, g - 12, '#a0703f', 15, 1);
  px(ctx, e + 3, g - 10, LAYERS.dirt.tunnel, 8, 10);

  sprite(ctx, SPRITES.smallChest, PAL.chest, L.chestX, g - 6);
  if (ideas > 0) glow(ctx, L.chestX + 3, g - 4, 5, '#ffe066', 0.18);

  lanterns.forEach((l, i) => {
    const x = L.lanterns[i];
    if (l.lit) {
      glow(ctx, x + 3, L.lanternY + 3, l.bonus ? 11 : 8, '#ffcf5a', l.bonus ? 0.3 : 0.24);
      px(ctx, x - 1, g, 'rgba(255,220,120,0.35)', 9, 1);
    }
    sprite(ctx, SPRITES.lantern, l.lit ? PAL.lanternLit : PAL.lanternOff, x, L.lanternY, { alpha: l.due ? 1 : 0.45 });
  });

  if (digger) sprite(ctx, SPRITES.digger, PAL.digger, L.diggerX, g - 12);
}

function drawBeds(ctx, w, L, garden) {
  const soil = garden.watered ? '#3e2a1a' : '#5a3a22';
  for (let r = 0; r < L.bedRows; r++) {
    const y = L.bedTop + r * BED_ROW_H + 7;
    px(ctx, BED_X - 1, y, soil, w - BED_X - 1, 3);
    px(ctx, BED_X - 1, y, garden.watered ? '#4a3220' : '#6b4a2a', w - BED_X - 1, 1);
  }
  const slot = (k) => {
    const r = Math.floor(k / L.perRow);
    return { x: BED_X + (k % L.perRow) * SLOT_W, soilY: L.bedTop + r * BED_ROW_H + 7 };
  };
  const firstWilted = garden.plants.length - garden.wilted;
  garden.plants.forEach((plant, k) => {
    const n = dayHash(plant.date);
    const type = PLANT_TYPES[n % PLANT_TYPES.length];
    const wilted = k >= firstWilted;
    const rows = GARDEN[wilted ? `${type}Wilt` : type];
    const pal = wilted ? GARDEN_PAL.wilt : { ...GARDEN_PAL.plant, p: PETALS[n % PETALS.length] };
    const { x, soilY } = slot(k);
    sprite(ctx, rows, pal, x, soilY - rows.length);
    if (plant.fresh) px(ctx, x + 4, soilY - rows.length - 2, '#ffffff');
    if (garden.watered && !wilted && k % 3 === 0) px(ctx, x + 1, soilY - 1, '#6cc8f0');
  });
  for (let j = 0; j < garden.weeds; j++) {
    const { x, soilY } = slot(garden.plants.length + j);
    sprite(ctx, GARDEN.weed, GARDEN_PAL.weed, x, soilY - GARDEN.weed.length);
  }
}

// ---------- Schicht mit Tunneln ----------

export const LAYER_GEO = { padTop: 5, signH: 12, rowH: 27, padBottom: 5, labelH: 8, barY: 8, tunnelY: 11, tunnelH: 13 };
export const layerHeight = (rows) => LAYER_GEO.padTop + LAYER_GEO.signH + rows * LAYER_GEO.rowH + LAYER_GEO.padBottom;
export const rowTop = (i) => LAYER_GEO.padTop + LAYER_GEO.signH + i * LAYER_GEO.rowH;

const FIND_SPRITES = [['ore', PAL.ore], ['crystal', PAL.crystal], ['smallChest', PAL.chest]];

// rows: [{ progress, valueFrac (nur Zahlenziele), digger }]
export function drawLayer(ctx, w, h, { layer, prevLayer, rows, seed }) {
  const pal = LAYERS[layer] || LAYERS.stone;
  fillRock(ctx, 0, 0, w, h, pal, seed);
  if (prevLayer) jaggedTop(ctx, w, LAYERS[prevLayer] || pal, seed);
  drawShaft(ctx, 0, h, pal);
  rows.forEach((row, i) => drawTunnel(ctx, w, rowTop(i), row, pal, seed + i * 31));
}

function drawTunnel(ctx, w, top, { progress, valueFrac, digger, digging, frame = 0 }, pal, seed) {
  const x0 = SHAFT.x + SHAFT.w;
  const xEnd = w - 8;
  const L = xEnd - x0;
  const ty = top + LAYER_GEO.tunnelY;
  const th = LAYER_GEO.tunnelH;
  // Ein kurzes Stück ist von Anfang an gegraben, damit der Tunnel als Tunnel erkennbar ist.
  const tip = Math.round(x0 + 12 + (L - 12) * progress.dug);

  // Balken über dem Tunnel bei Zahlenzielen.
  if (valueFrac != null) {
    const by = top + LAYER_GEO.barY;
    px(ctx, x0, by, pal.edge, L, 2);
    px(ctx, x0, by, '#7ee8fa', Math.round(L * Math.min(1, valueFrac)), 2);
  }

  // Gegrabener Bereich mit unregelmäßiger Decke und Boden.
  for (let x = x0; x < tip; x++) {
    const nearTip = tip - x <= 2;
    const t = (hash(x, ty, seed) < 0.3 ? 1 : 0) + (nearTip ? Math.floor(hash(x, 3, seed) * 3) : 0);
    const b = (hash(x, ty + 5, seed) < 0.3 ? 1 : 0) + (nearTip ? Math.floor(hash(x, 4, seed) * 3) : 0);
    px(ctx, x, ty - 1 + t, pal.edge);
    px(ctx, x, ty + t, pal.tunnel, 1, th - t - b);
    px(ctx, x, ty + th - b, pal.edge);
  }

  // Holzstützen und Fackeln im gegrabenen Teil.
  for (let sx = x0 + 8; sx < tip - 5; sx += 18) {
    px(ctx, sx - 3, ty + 1, '#a0703f', 9, 1);
    px(ctx, sx - 3, ty + 2, '#8a5a32', 9, 1);
    px(ctx, sx - 2, ty + 3, '#6b4226', 2, th - 3);
    px(ctx, sx + 4, ty + 3, '#6b4226', 2, th - 3);
  }
  for (let tx = x0 + 17; tx < tip - 6; tx += 36) {
    glow(ctx, tx + 1, ty + 4, 7, '#ffb84a', 0.2);
    sprite(ctx, SPRITES.torch, PAL.torch, tx, ty + 3);
  }

  // Funde: erreicht = leuchtender Kristall im Tunnel, sonst halb im Gestein.
  let nextMarked = false;
  progress.finds.forEach((find, i) => {
    const last = i === progress.finds.length - 1;
    const fx = Math.round(x0 + 12 + (L - 12) * find.at);
    if (find.reached) {
      if (last) {
        glow(ctx, fx, ty + 8, 9, '#ffe066', 0.3);
        sprite(ctx, SPRITES.chest, PAL.chest, fx - 5, ty + th - 8);
      } else {
        glow(ctx, fx, ty + th - 4, 6, '#7ee8fa', 0.3);
        sprite(ctx, SPRITES.crystal, PAL.crystal, fx - 2, ty + th - 7);
      }
      return;
    }
    const isNext = !nextMarked;
    nextMarked = true;
    const [name, palette] = last ? ['chest', PAL.chest] : FIND_SPRITES[i % FIND_SPRITES.length];
    const rows = SPRITES[name];
    const sx = fx - Math.floor(rows[0].length / 2);
    const sy = ty + Math.floor((th - rows.length) / 2);
    const cover = isNext ? 0.3 : 0.55;
    sprite(ctx, rows, palette, sx, sy, { alpha: isNext ? 0.95 : 0.6, mask: (mx, my) => hash(sx + mx, sy + my, seed + 77) < cover });
    if (isNext) px(ctx, sx + rows[0].length - 1, sy - 1, '#ffffff');
  });

  if (digger) {
    const dx = Math.max(x0 + 1, tip - 12);
    glow(ctx, dx + 10, ty + 2, 6, '#fff6a0', 0.18);
    const swing = digging && frame % 2 === 1;
    sprite(ctx, swing ? SPRITES.diggerSwing : SPRITES.digger, PAL.digger, dx, ty + th - 12);
    // Beim Aufschlag fliegen Steinkrümel von der Tunnelwand.
    if (digging && !swing) {
      for (let i = 0; i < 5; i++) {
        const n = hash(i, frame, seed);
        px(ctx, tip - 1 + Math.round(n * 3), ty + 3 + Math.round(hash(frame, i, seed) * 8), i % 2 ? pal.light : pal.speck);
      }
    }
  }
}

// Ein einzelner Tunnel als schmaler Streifen (Kopf der Detailansicht), unten bündig.
export const STRIP_H = LAYER_GEO.tunnelY + LAYER_GEO.tunnelH + 3;
export function drawStrip(ctx, w, h, { layer, row, seed }) {
  const pal = LAYERS[layer] || LAYERS.stone;
  fillRock(ctx, 0, 0, w, h, pal, seed);
  drawTunnel(ctx, w, h - STRIP_H, row, pal, seed);
}

export function drawBedrock(ctx, w, h, { prevLayer }) {
  fillRock(ctx, 0, 0, w, h, LAYERS.bedrock, 99);
  if (prevLayer) jaggedTop(ctx, w, LAYERS[prevLayer], 99, 5);
}

// ---------- Wasser-Krug ----------

export const JUG = { w: 20, h: 24 };
const JUG_IN = { x: 3, y: 5, w: 12, h: 18 };

// frac: Füllstand 0–1 (darf > 1 sein = läuft über); liters: Tagesziel in Litern für die Striche.
export function drawJug(ctx, frac, liters) {
  const o = '#0a0810';
  ctx.clearRect(0, 0, JUG.w, JUG.h);
  // Henkel
  px(ctx, 15, 7, o, 4, 1); px(ctx, 18, 7, o, 1, 10); px(ctx, 15, 16, o, 4, 1);
  px(ctx, 16, 8, '#5a6886', 2, 1); px(ctx, 17, 8, '#5a6886', 1, 8); px(ctx, 16, 15, '#5a6886', 2, 1);
  // Hals, Ausguss, Körper
  px(ctx, 4, 1, o, 10, 1); px(ctx, 1, 2, o, 4, 1); px(ctx, 1, 3, o, 1, 1);
  px(ctx, 13, 2, o, 1, 3); px(ctx, 2, 4, o, 1, 1);
  px(ctx, 2, 5, o, 1, 18); px(ctx, 15, 5, o, 1, 18); px(ctx, 3, 23, o, 12, 1);
  px(ctx, 3, 4, o, 1, 1); px(ctx, 14, 4, o, 1, 1);
  px(ctx, 2, 2, '#39445e', 2, 2); px(ctx, 5, 2, '#39445e', 8, 3); px(ctx, 3, 3, '#39445e', 1, 1);
  px(ctx, JUG_IN.x, JUG_IN.y, '#39445e', JUG_IN.w, JUG_IN.h);

  const rows = Math.round(Math.min(1, frac) * JUG_IN.h);
  if (rows > 0) {
    const top = JUG_IN.y + JUG_IN.h - rows;
    px(ctx, JUG_IN.x, top, '#4aa8e0', JUG_IN.w, rows);
    px(ctx, JUG_IN.x, top, '#9fdcff', JUG_IN.w, 1);
  }
  if (frac >= 1) {
    px(ctx, 5, 2, '#4aa8e0', 8, 3);
    px(ctx, 5, 2, '#9fdcff', 8, 1);
    px(ctx, 0, 4, '#4aa8e0', 1, 2);
  }
  // Glanzstreifen und Literstriche.
  px(ctx, 4, 7, 'rgba(255,255,255,0.35)', 1, 12);
  for (let l = 1; l < liters; l++) {
    const y = Math.round(JUG_IN.y + JUG_IN.h - (l / liters) * JUG_IN.h);
    px(ctx, 11, y, 'rgba(255,255,255,0.75)', 3, 1);
  }
}

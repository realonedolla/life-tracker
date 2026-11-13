// Profil: der eigene Gräber in seiner Schatzkammer, mit Level, Ausrüstung, Abzeichen und Rekorden.

import { html, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import {
  BIG_H, BIG_W, GEAR, GEAR_SLOTS, HAIRS, SHIRTS, SKINS, drawBigDigger, drawItemIcon, drawPet,
} from '../character.js';
import { XP, computeProfile, saveLook } from '../profile.js';
import { drawChamber } from '../scene.js';
import { syncState, join } from '../sync.js';
import { Sheet, formatNumber } from '../ui.js';

const SCALE = 5;          // ein Kunst-Pixel = 5 CSS-Pixel: der Gräber wirkt groß
const SCENE_H = 44;       // Höhe der Kammer in Kunst-Pixeln
const hours = (h) => `${(Math.round(h * 10) / 10).toLocaleString('de-DE')} h`;

function useFrame(ms = 180) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setFrame((f) => f + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return frame;
}

// ---------- Szene ----------

function Chamber({ look, gear }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [w, setW] = useState(0);
  const frame = useFrame();
  useEffect(() => {
    const ro = new ResizeObserver(() => setW(Math.ceil(wrap.current.clientWidth / SCALE)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!w) return;
    const c = canvas.current;
    c.width = w;
    c.height = SCENE_H;
    const ctx = c.getContext('2d');
    drawChamber(ctx, w, SCENE_H, frame);
    const x = Math.round((w - BIG_W) / 2);
    const floor = SCENE_H - 5;
    drawBigDigger(ctx, x, floor - BIG_H, look, gear, frame);
    drawPet(ctx, x - 11, floor, gear, frame);
  }, [w, frame, look, gear]);
  return html`
    <div class="chamber" ref=${wrap} style="height:${SCENE_H * SCALE}px">
      <canvas ref=${canvas} style="width:${w * SCALE}px;height:${SCENE_H * SCALE}px" aria-hidden="true"></canvas>
    </div>`;
}

function ItemIcon({ slot, tier, locked }) {
  const ref = useRef(null);
  useEffect(() => { drawItemIcon(ref.current.getContext('2d'), 12, 12, slot, tier, locked); }, [slot, tier, locked]);
  return html`<canvas class="item-icon" ref=${ref} width="12" height="12" aria-hidden="true"></canvas>`;
}

// Was bis zur nächsten Stufe fehlt, in Worten.
const plural = (n, one, many) => `${formatNumber(n)} ${n === 1 ? one : many}`;
function missingText(slot, g) {
  const n = Math.max(0, Math.ceil(g.next.at - g.value));
  switch (slot) {
    case 'pick': return `noch ${hours(Math.max(0, g.next.at - g.value))} Arbeit in Sessions`;
    case 'helmet':
    case 'pet': return `${g.next.at} Tage am Stück den Plan erfüllen (Rekord: ${formatNumber(g.value)})`;
    case 'lamp': return `noch ${plural(n, 'Gold-Tag', 'Gold-Tage')}`;
    case 'pack': return `noch ${plural(n, 'Fund', 'Funde')} freilegen`;
    case 'boots': return `noch ${plural(n, 'Tag', 'Tage')} mit vollem Wasser`;
    default: return `noch ${formatNumber(n)}`;
  }
}

// ---------- Seite ----------

export function ProfileView({ store, reload, notify }) {
  const profile = useMemo(() => computeProfile(store), [store]);
  const [edit, setEdit] = useState(false);
  const { look } = store;
  const { stats, gear } = profile;
  const pct = Math.min(100, ((profile.xp - profile.levelXp) / (profile.nextXp - profile.levelXp)) * 100);

  return html`
    <section class="profile-hero">
      <${Chamber} look=${look} gear=${gear} />
      <div class="lvl-shield" aria-label="Level ${profile.level}"><span>LV</span><b>${profile.level}</b></div>
      <button class="btn secondary icon edit-look" onClick=${() => setEdit(true)} aria-label="Aussehen ändern">✎</button>
      <div class="hero-banner">
        <span class="hero-name">${look.name}</span>
        <span class="sign hero-title"><span class="label">${profile.title}</span></span>
      </div>
      <div class="xp">
        <div class="xp-bar" role="progressbar" aria-valuemin=${profile.levelXp} aria-valuemax=${profile.nextXp} aria-valuenow=${profile.xp}>
          <span style="width:${pct}%"></span>
        </div>
        <div class="xp-text num"><span>${formatNumber(profile.xp - profile.levelXp)} / ${formatNumber(profile.nextXp - profile.levelXp)} XP</span><span>bis Level ${profile.level + 1}</span></div>
      </div>
    </section>

    <section class="panel">
      <h2 class="label">Ausrüstung</h2>
      <div class="inventory">
        ${GEAR_SLOTS.map((slot) => {
          const g = gear[slot];
          const def = GEAR[slot];
          const empty = !g.tier.color;
          const fromAt = g.tier.at;
          const prog = g.next ? Math.min(100, ((g.value - fromAt) / (g.next.at - fromAt)) * 100) : 100;
          return html`
            <div class="item ${empty ? 'empty' : ''} tier-${g.index}" key=${slot}>
              <div class="item-frame"><${ItemIcon} slot=${slot} tier=${g.tier} locked=${empty} /></div>
              <div class="item-name">${g.tier.name}</div>
              <div class="item-slot">${def.label}</div>
              ${g.next
                ? html`<div class="item-bar"><span style="width:${prog}%"></span></div>
                  <div class="item-next">${missingText(slot, g)}<br /><span class="item-goal">→ ${g.next.name}</span></div>`
                : html`<div class="item-next max">Höchste Stufe</div>`}
            </div>`;
        })}
      </div>
      <p class="muted small">Ausrüstung wird durch echte Leistung besser: Spitzhacke durch Arbeitsstunden, Helm und Begleiter durch deinen Streak-Rekord, Lampe durch Gold-Tage, Rucksack durch Funde, Stiefel durch Tage mit vollem Wasser.</p>
    </section>

    <section class="panel">
      <h2 class="label">Abzeichen · ${profile.badges.filter((b) => b.earned).length}/${profile.badges.length}</h2>
      <div class="medals">
        ${profile.badges.map((b) => html`
          <button key=${b.id} class="medal ${b.earned ? 'on' : ''}" onClick=${() => notify(`${b.name}: ${b.desc}${b.earned ? ' ✓' : ''}`)}
            aria-label="${b.name}: ${b.desc}${b.earned ? ', erreicht' : ', noch nicht erreicht'}">
            <span class="medal-coin" aria-hidden="true">${b.earned ? '★' : '?'}</span>
            <span class="medal-name">${b.name}</span>
          </button>`)}
      </div>
    </section>

    <section class="panel tablet">
      <h2 class="label">Rekorde</h2>
      <dl class="kv">
        <dt>Erfahrung gesamt</dt><dd>${formatNumber(profile.xp)} XP</dd>
        <dt>Längster Streak</dt><dd>${stats.longestStreak} Tage</dd>
        <dt>Gold-Tage</dt><dd>${stats.goldDays}</dd>
        <dt>Session-Stunden</dt><dd>${hours(stats.totalHours)}</dd>
        <dt>Längste Session</dt><dd>${hours(stats.longestSession)}</dd>
        <dt>Funde freigelegt</dt><dd>${stats.finds}</dd>
        <dt>Ziele geschafft</dt><dd>${stats.goalsDone}</dd>
        <dt>Routinen erledigt</dt><dd>${stats.routinesDone}</dd>
      </dl>
      <details class="xp-help">
        <summary class="small">Wofür gibt es XP?</summary>
        <ul class="plain-list small muted">
          <li>Routine ${XP.routine} · Bonus ${XP.bonus} · Tagesziel ${XP.task}</li>
          <li>Session-Stunde ${XP.hour} · Tag mit vollem Wasser ${XP.waterDay}</li>
          <li>Fund ${XP.find} · Gold-Tag ${XP.goldDay} · Ziel geschafft ${XP.goal}</li>
        </ul>
      </details>
    </section>

    ${edit && html`<${LookSheet} look=${look} gear=${gear} reload=${reload} notify=${notify} onClose=${() => setEdit(false)} />`}`;
}

// ---------- Aussehen ändern ----------

function Preview({ look, gear }) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    ctx.clearRect(0, 0, BIG_W + 4, BIG_H + 4);
    drawBigDigger(ctx, 2, 2, look, gear, 0);
  }, [look, gear]);
  return html`<canvas class="look-preview" ref=${ref} width=${BIG_W + 4} height=${BIG_H + 4} aria-hidden="true"></canvas>`;
}

function Swatches({ colors, value, onPick, label }) {
  return html`
    <p class="field-label">${label}</p>
    <div class="chips">
      ${colors.map((c) => html`
        <button type="button" key=${c} class="color-pick ${value === c ? 'on' : ''}" style="background:${c}"
          aria-label="${label} ${c}" aria-pressed=${value === c} onClick=${() => onPick(c)}></button>`)}
    </div>`;
}

function LookSheet({ look, gear, reload, notify, onClose }) {
  const [draft, setDraft] = useState(look);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const save = async () => {
    const name = draft.name.trim() || 'Gräber';
    await saveLook({ ...draft, name });
    // Wer beim Freunde-Abgleich mitmacht, nimmt den neuen Namen mit.
    const sync = await syncState();
    if (sync?.joined && sync.name !== name) await join(name).catch(() => {});
    await reload();
    notify('Gespeichert.');
    onClose();
  };
  return html`
    <${Sheet} title="Dein Gräber" onClose=${onClose}>
      <div class="look-top">
        <${Preview} look=${draft} gear=${gear} />
        <label class="field">Name<input value=${draft.name} maxlength="20" onInput=${(e) => set('name')(e.target.value)} /></label>
      </div>
      <${Swatches} label="Haut" colors=${SKINS} value=${draft.skin} onPick=${set('skin')} />
      <${Swatches} label="Haare" colors=${HAIRS} value=${draft.hair} onPick=${set('hair')} />
      <${Swatches} label="Shirt" colors=${SHIRTS} value=${draft.shirt} onPick=${set('shirt')} />
      <div class="row sheet-actions"><button class="btn" onClick=${save}>Speichern</button></div>
    <//>`;
}

// ---------- Aufstieg feiern ----------

export function Celebration({ news, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    const W = (c.width = 90), H = (c.height = 160);
    const bits = Array.from({ length: 70 }, (_, i) => ({
      x: Math.random() * W, y: -Math.random() * H, v: 0.6 + Math.random() * 1.4,
      c: ['#f4c430', '#fff1a8', '#7ee8fa', '#ff7eb6', '#63c74d'][i % 5],
    }));
    let raf;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const b of bits) {
        b.y += b.v;
        if (b.y > H) b.y = -2;
        ctx.fillStyle = b.c;
        ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 2);
      }
      raf = requestAnimationFrame(tick);
    };
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  const ICON = { level: '▲', gear: '⚒', badge: '★' };
  return html`
    <div class="celebrate" role="dialog" aria-label="Neu freigeschaltet">
      <canvas ref=${ref} class="confetti" aria-hidden="true"></canvas>
      <div class="celebrate-card panel">
        <h2 class="label">Aufgestiegen!</h2>
        <ul class="plain-list">
          ${news.map((n, i) => html`
            <li key=${i} class="celebrate-row"><span class="celebrate-icon" aria-hidden="true">${ICON[n.kind]}</span>
              <span><b>${n.text}</b><br /><span class="muted small">${n.sub}</span></span></li>`)}
        </ul>
        <div class="row sheet-actions">
          <a class="btn" href="#/profil" onClick=${onClose}>Ansehen</a>
          <button class="btn secondary" onClick=${onClose}>Weiter</button>
        </div>
      </div>
    </div>`;
}

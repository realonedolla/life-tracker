// Kalender: Monatsraster nach Aktivität, Fotoreihen pro Tag und Tagesrückblick.

import { html, useState } from '../vendor/preact-htm.js';
import {
  PHOTO_SLOTS, dayActivity, dayStatus, goalMoves, hoursByArea, sessionDuration, waterGoal, waterTotal,
} from '../model.js';
import { addDays, formatDate, hhmm, parseDayKey } from '../time.js';
import { BlobImage, Icon, Sheet, formatNumber } from '../ui.js';
import { targetLabel } from './session.js';

const pad = (n) => String(n).padStart(2, '0');
const liters = (ml) => (ml / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`);
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function monthDays(month) {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
}
function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const monthName = (month) => parseDayKey(`${month}-01`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

export function CalendarView({ store }) {
  const [month, setMonth] = useState(store.today.slice(0, 7));
  const [mode, setMode] = useState('raster');
  const [day, setDay] = useState(null);
  const days = monthDays(month);
  const isCurrent = month === store.today.slice(0, 7);

  return html`
    <section class="panel">
      <div class="cal-head">
        <button class="btn secondary icon" onClick=${() => setMonth(shiftMonth(month, -1))} aria-label="Vormonat">‹</button>
        <h2 class="cal-title">${monthName(month)}</h2>
        <button class="btn secondary icon" onClick=${() => setMonth(shiftMonth(month, 1))} disabled=${isCurrent} aria-label="Nächster Monat">›</button>
      </div>
      <div class="segmented cal-mode" role="tablist">
        <label class=${mode === 'raster' ? 'on' : ''}><input type="radio" name="calmode" checked=${mode === 'raster'} onChange=${() => setMode('raster')} />Raster</label>
        <label class=${mode === 'fotos' ? 'on' : ''}><input type="radio" name="calmode" checked=${mode === 'fotos'} onChange=${() => setMode('fotos')} />Fotos</label>
      </div>
      ${mode === 'raster'
        ? html`<${MonthGrid} store=${store} days=${days} onPick=${setDay} />`
        : html`<${PhotoRows} store=${store} days=${days} onPick=${setDay} />`}
    </section>
    <${MonthSummary} store=${store} days=${days} />
    ${day && html`<${DaySheet} store=${store} date=${day} onClose=${() => setDay(null)} onMove=${(n) => setDay(addDays(day, n))} />`}`;
}

function MonthGrid({ store, days, onPick }) {
  const lead = (parseDayKey(days[0]).getDay() + 6) % 7;
  return html`
    <div class="cal-grid" role="grid">
      ${WEEKDAYS.map((w) => html`<div class="cal-wd small muted" key=${w}>${w}</div>`)}
      ${Array.from({ length: lead }, (_, i) => html`<div key=${`x${i}`}></div>`)}
      ${days.map((key) => {
        const future = key > store.today;
        const a = dayActivity(store, key);
        const kept = !future && dayStatus(store, key).fulfilled;
        return html`
          <button key=${key} class="cal-day lvl-${a.level} ${key === store.today ? 'today' : ''}" disabled=${future}
            onClick=${() => onPick(key)}
            aria-label="${formatDate(key, { weekday: 'long', day: 'numeric', month: 'long' })}${kept ? ', Plan erfüllt' : ''}${a.photos ? `, ${a.photos} Fotos` : ''}">
            <span class="num">${Number(key.slice(8))}</span>
            ${kept && html`<span class="cal-kept"><${Icon} name="flamme" scale=${2} /></span>`}
            ${a.photos > 0 && html`<span class="cal-photo" aria-hidden="true"></span>`}
          </button>`;
      })}
    </div>
    <div class="cal-legend small muted">
      <span>weniger</span>
      ${[0, 1, 2, 3, 4].map((l) => html`<span class="cal-swatch lvl-${l}" key=${l}></span>`)}
      <span>mehr</span>
      <span class="cal-legend-kept"><${Icon} name="flamme" scale=${2} /> Plan erfüllt</span>
    </div>`;
}

// Jeder Tag als Bildreihe mit seinen fünf Foto-Slots.
function PhotoRows({ store, days, onPick }) {
  const withPhotos = days.filter((k) => k <= store.today && store.photos.some((p) => p.date === k && p.slot)).reverse();
  if (!withPhotos.length) return html`<p class="muted small">In diesem Monat noch keine Fotos.</p>`;
  return html`
    <ul class="list photo-rows">
      ${withPhotos.map((key) => {
        const photos = store.photos.filter((p) => p.date === key && p.slot);
        return html`
          <li key=${key}>
            <button class="plain photo-row" onClick=${() => onPick(key)}>
              <span class="small">${formatDate(key)}</span>
              <span class="photo-strip">
                ${PHOTO_SLOTS.map((s) => {
                  const p = photos.find((x) => x.slot === s.key);
                  return html`<span class="mini" key=${s.key}>${p ? html`<${BlobImage} blob=${p.thumb} alt=${s.label} />` : ''}</span>`;
                })}
              </span>
            </button>
          </li>`;
      })}
    </ul>`;
}

function MonthSummary({ store, days }) {
  const past = days.filter((k) => k <= store.today);
  if (!past.length) return null;
  const h = hoursByArea(store, past[0], past.at(-1));
  const kept = past.filter((k) => dayStatus(store, k).fulfilled).length;
  const photoDays = past.filter((k) => store.photos.some((p) => p.date === k && p.slot)).length;
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  return html`
    <section class="panel">
      <h2 class="label">Monat</h2>
      <dl class="kv">
        <dt>Plan erfüllt</dt><dd>${kept} von ${past.length} Tagen</dd>
        <dt>Tage mit Fotos</dt><dd>${photoDays}</dd>
        ${areas.map((a) => html`<dt key=${a.id}>${a.name}</dt><dd>${h[a.id] ? hours(h[a.id]) : '–'}</dd>`)}
      </dl>
    </section>`;
}

// ---------- Tagesrückblick ----------

function DaySheet({ store, date, onClose, onMove }) {
  const [big, setBig] = useState(null);
  const day = store.days.find((d) => d.date === date);
  const status = dayStatus(store, date);
  const entries = store.entries.filter((e) => e.date === date && e.kind !== 'block');
  const done = entries.filter((e) => e.doneAt);
  const open = entries.filter((e) => !e.doneAt);
  const photos = store.photos.filter((p) => p.date === date && p.slot);
  const sessions = store.sessions.filter((s) => s.date === date).sort((a, b) => a.startAt - b.startAt);
  const perArea = hoursByArea(store, date, date);
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  const moves = goalMoves(store, date);
  const empty = !entries.length && !photos.length && !sessions.length && !waterTotal(day) && !moves.length;

  return html`
    <${Sheet} title=${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })} onClose=${onClose}>
      <div class="day-nav">
        <button class="btn secondary small-btn" onClick=${() => onMove(-1)}>‹ Vortag</button>
        <span class=${status.fulfilled ? 'ok-text small' : 'muted small'}>${status.fulfilled ? 'Plan erfüllt' : empty ? 'Keine Einträge' : 'Plan nicht erfüllt'}</span>
        <button class="btn secondary small-btn" onClick=${() => onMove(1)} disabled=${date >= store.today}>Folgetag ›</button>
      </div>

      <div class="photo-strip big">
        ${PHOTO_SLOTS.map((s) => {
          const p = photos.find((x) => x.slot === s.key);
          return html`
            <button class="mini" key=${s.key} disabled=${!p} onClick=${() => setBig(p)} aria-label=${p ? `${s.label} ansehen` : `${s.label}: kein Foto`}>
              ${p ? html`<${BlobImage} blob=${p.thumb} alt="" />` : html`<span class="small muted">${s.short || s.label}</span>`}
            </button>`;
        })}
      </div>
      ${big && html`<button class="plain photo-full" onClick=${() => setBig(null)} aria-label="Foto schließen"><${BlobImage} blob=${big.blob} alt="" /></button>`}

      <dl class="kv small day-kv">
        <dt>Wasser</dt><dd>${liters(waterTotal(day))} / ${liters(waterGoal(day, store.settings))} l</dd>
        ${areas.filter((a) => perArea[a.id]).map((a) => html`<dt key=${a.id}>${a.name}</dt><dd>${hours(perArea[a.id])}</dd>`)}
      </dl>

      ${moves.length > 0 && html`
        <h3 class="sub">Ziele bewegt</h3>
        <ul class="plain-list">
          ${moves.map((m, i) => html`<li key=${i}>${
            m.type === 'value' ? html`${m.goal.title}: <b class="num">${formatNumber(m.before)} → ${formatNumber(m.after)}</b> <span class="muted num">(${m.after > m.before ? '+' : ''}${formatNumber(m.after - m.before)})</span>`
            : m.type === 'find' ? html`${m.goal.title}: <span class="ok-text">◆ ${m.milestone.title}</span>`
            : html`<span class="ok-text">Schatz freigelegt: ${m.goal.title}</span>`}</li>`)}
        </ul>`}

      ${done.length > 0 && html`
        <h3 class="sub">Erledigt</h3>
        <ul class="plain-list">${done.map((e) => html`<li key=${e.id}>✓ ${e.title}${e.bonusDoneAt ? ' + Bonus' : ''}</li>`)}</ul>`}
      ${open.length > 0 && html`
        <h3 class="sub">Offen</h3>
        <ul class="plain-list muted">${open.map((e) => html`<li key=${e.id}>${e.title}${e.movedTo ? ' → verschoben' : ''}</li>`)}</ul>`}

      ${sessions.length > 0 && html`
        <h3 class="sub">Sessions</h3>
        <ul class="plain-list">
          ${sessions.map((s) => html`
            <li key=${s.id}><span class="muted num">${hhmm(s.startAt)}–${s.endAt ? hhmm(s.endAt) : 'läuft'}</span>${' '}
              ${targetLabel(store, s)} · <span class="num">${hours(sessionDuration(s) / 3_600_000)}</span>
              ${s.note && html`<div class="muted small">${s.note}</div>`}</li>`)}
        </ul>`}
    <//>`;
}

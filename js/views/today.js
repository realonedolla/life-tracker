// Tagesplan: Routinen, Tagesziele und Timetable sind dieselben Einträge, nur anders gezeigt.

import { html, useRef, useState } from '../vendor/preact-htm.js';
import {
  WINDOWS, activeSession, addBlock, addTask, carryOver, dayStatus, deleteEntry, hoursByArea,
  markReviewed, sessionDuration, setEntryDone, setPlanned, streak, updateEntry, waterGoal, waterTotal, weekStart,
} from '../model.js';
import { hhmm } from '../time.js';
import { Icon, Sheet, formatNumber } from '../ui.js';
import {
  EditSessionSheet, SessionCard, StartSheet, StopSheet, TargetPicker, startFromEntry, targetLabel, useTick,
} from './session.js';
import { ReminderBar } from './reminders.js';

const pad = (n) => String(n).padStart(2, '0');
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fmtMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const liters = (ml) => (ml / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`);

const HOUR_PX = 56;
const SNAP = 15;
const DEFAULT_LEN = { routine: 30, task: 30, block: 60 };
const WINDOW_ORDER = ['morning', 'midday', 'evening', 'fixed'];

function slotRange(e) {
  const start = toMin(e.slot.start);
  let end = e.slot.end ? toMin(e.slot.end) : start + DEFAULT_LEN[e.kind];
  if (end <= start) end += 1440;
  return { start, end };
}

export function Today({ store, reload, notify }) {
  useTick(30_000);
  const today = store.today;
  const day = store.days.find((d) => d.date === today);
  const entries = store.entries.filter((e) => e.date === today);
  const session = activeSession(store.sessions);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const reviewTime = toMin(store.settings.reviewTime);
  const [sheet, setSheet] = useState(null);
  const close = () => setSheet(null);
  const ctx = { store, reload, notify };

  const startEntry = (entry) => startFromEntry(store, entry, ctx);

  return html`
    <${ReminderBar} store=${store} skip=${['plan', 'review']} onChange=${reload} />
    <${DayHeader} store=${store} />

    ${session
      ? html`<${SessionCard} store=${store} session=${session} reload=${reload} onStop=${() => setSheet({ type: 'stop', session })} />`
      : html`<button class="btn wide" onClick=${() => setSheet({ type: 'start' })}>Session starten</button>`}

    ${!day?.plannedAt && nowMin < reviewTime && html`
      <section class="panel callout">
        <h2 class="label">Tag planen</h2>
        <p class="muted small">Routinen sind schon drin. Ergänze Tagesziele und zieh Einträge am Griff ⠿ in den Timetable.</p>
        <button class="btn secondary" onClick=${async () => { await setPlanned(today); reload(); }}>Plan steht</button>
      </section>`}

    ${nowMin >= reviewTime && !day?.reviewedAt && html`
      <section class="panel callout">
        <h2 class="label">Abendrückblick</h2>
        <p class="muted small">Was ist erledigt, was bleibt offen?</p>
        <button class="btn" onClick=${() => setSheet({ type: 'review' })}>Rückblick öffnen</button>
      </section>`}

    <${Routines} store=${store} entries=${entries} reload=${reload} />
    <${Tasks} store=${store} entries=${entries} reload=${reload} notify=${notify} onEdit=${(e) => setSheet({ type: 'entry', entry: e })} />
    <${Timetable} store=${store} entries=${entries} nowMin=${nowMin} reload=${reload}
      onEdit=${(e) => setSheet({ type: 'entry', entry: e })}
      onStart=${startEntry}
      onAddBlock=${() => setSheet({ type: 'block' })} />
    <${SessionsToday} store=${store} onEdit=${(s) => setSheet({ type: 'edit', session: s })}
      onAdd=${() => setSheet({ type: 'edit', session: null })} />

    ${day?.reviewedAt && html`
      <p class="center small"><button class="link" onClick=${() => setSheet({ type: 'review' })}>Rückblick erneut öffnen</button></p>`}
    ${!day?.reviewedAt && nowMin < reviewTime && html`
      <p class="center small"><button class="link" onClick=${() => setSheet({ type: 'review' })}>Rückblick jetzt schon öffnen</button></p>`}

    ${sheet?.type === 'start' && html`<${StartSheet} ...${ctx} onClose=${close} />`}
    ${sheet?.type === 'stop' && html`<${StopSheet} ...${ctx} session=${sheet.session} onClose=${close} />`}
    ${sheet?.type === 'edit' && html`<${EditSessionSheet} ...${ctx} session=${sheet.session} date=${today} onClose=${close} />`}
    ${sheet?.type === 'entry' && html`<${EntrySheet} ...${ctx} entry=${sheet.entry} onStart=${startEntry} onClose=${close} />`}
    ${sheet?.type === 'block' && html`<${BlockSheet} ...${ctx} nowMin=${nowMin} onClose=${close} />`}
    ${sheet?.type === 'review' && html`<${ReviewSheet} ...${ctx} onClose=${close} />`}`;
}

// ---------- Kopf: Stand des Tages ----------

function DayHeader({ store }) {
  const status = dayStatus(store, store.today);
  const st = streak(store, store.today);
  const { routines, tasks, water, photos } = status.parts;
  const pill = (label, done, total, text) => html`
    <span class="pill ${done >= total ? 'ok' : ''}">${label} <b class="num">${text ?? `${done}/${total}`}</b></span>`;
  return html`
    <section class="day-head">
      <span class="streak ${st.todayKept ? 'on' : ''}"><${Icon} name="flamme" scale=${2} /><span class="label num">${st.count}</span></span>
      <div class="pills">
        ${pill('Routinen', ...routines)}
        ${tasks[1] > 0 && pill('Tagesziele', ...tasks)}
        ${pill('Wasser', water[0], water[1], `${liters(water[0])}/${liters(water[1])} l`)}
        ${pill('Fotos', photos[0], 1, `${photos[0]}/${photos[1]}`)}
      </div>
    </section>`;
}

function Check({ done, onClick, label }) {
  return html`<button class="check-btn ${done ? 'on' : ''}" aria-pressed=${done} aria-label=${label} onClick=${onClick}></button>`;
}

// ---------- Routinen ----------

function Routines({ store, entries, reload }) {
  const items = entries.filter((e) => e.kind === 'routine');
  const routineOf = (e) => store.routines.find((r) => r.id === e.routineId);
  const groups = WINDOW_ORDER
    .map((w) => [w, items.filter((e) => (routineOf(e)?.window || 'morning') === w)])
    .filter(([, list]) => list.length);
  const toggle = async (e, bonus = false) => {
    await setEntryDone(e.id, bonus ? !e.bonusDoneAt : !e.doneAt, { bonus });
    reload();
  };
  return html`
    <section class="panel">
      <h2 class="label">Routinen</h2>
      ${groups.map(([w, list]) => html`
        <div class="group" key=${w}>
          <div class="group-label small muted">${WINDOWS[w]}</div>
          <ul class="list plan-list">
            ${list.map((e) => {
              const r = routineOf(e);
              return html`
                <li key=${e.id} class=${e.doneAt ? 'done' : ''}>
                  <${Check} done=${Boolean(e.doneAt)} onClick=${() => toggle(e)} label="${e.title} erledigt" />
                  <div class="plan-text">
                    <div class="plan-title">${e.title}${e.slot?.start ? html` <span class="muted small num">· ${e.slot.start}</span>` : ''}</div>
                    <div class="muted small">Mindestens: ${r?.minVersion}</div>
                  </div>
                  ${r?.bonus && html`
                    <button class="bonus ${e.bonusDoneAt ? 'on' : ''}" aria-pressed=${Boolean(e.bonusDoneAt)} onClick=${() => toggle(e, true)}>
                      Bonus: ${r.bonus}
                    </button>`}
                </li>`;
            })}
          </ul>
        </div>`)}
    </section>`;
}

// ---------- Tagesziele ----------

function Tasks({ store, entries, reload, notify, onEdit }) {
  const items = entries.filter((e) => e.kind === 'task');
  const [title, setTitle] = useState('');
  const [goalId, setGoalId] = useState('');
  const [amount, setAmount] = useState('');
  const goal = store.goals.find((g) => g.id === goalId);
  const areas = [...store.areas].sort((a, b) => a.order - b.order);

  const add = async (event) => {
    event.preventDefault();
    const n = parseFloat(amount.replace(',', '.'));
    const text = title.trim() || (goal && Number.isFinite(n) ? `${formatNumber(n)} ${goal.unit}` : '');
    if (!text) return;
    await addTask(store.today, {
      title: text, goalId: goal?.id ?? null, areaId: goal?.areaId ?? null,
      amount: goal?.kind === 'number' && Number.isFinite(n) ? n : null,
    });
    setTitle(''); setAmount('');
    reload();
  };

  const toggle = async (e) => {
    const result = await setEntryDone(e.id, !e.doneAt);
    if (result) {
      const g = store.goals.find((x) => x.id === e.goalId);
      const found = result.reached.map((m) => m.title).join(', ');
      notify(`${g.title}: ${formatNumber(result.total)}${found ? ` · freigelegt: ${found}` : ''}`);
    }
    reload();
  };

  return html`
    <section class="panel">
      <h2 class="label">Tagesziele</h2>
      ${items.length === 0 && html`<p class="muted small">Noch keine. Einmalige Aufgaben für heute, z. B. „10 Backtests“.</p>`}
      <ul class="list plan-list">
        ${items.map((e) => {
          const g = store.goals.find((x) => x.id === e.goalId);
          return html`
            <li key=${e.id} class="${e.doneAt ? 'done' : ''} ${e.movedTo ? 'moved' : ''}">
              <${Check} done=${Boolean(e.doneAt)} onClick=${() => toggle(e)} label="${e.title} erledigt" />
              <button class="plan-text plain" onClick=${() => onEdit(e)}>
                <div class="plan-title">${e.title}</div>
                ${(g || e.carriedFrom || e.movedTo) && html`<div class="muted small">
                  ${g ? `→ ${g.title}${e.amount != null && g.kind === 'number' ? ` (+${formatNumber(e.amount)})` : ''}` : ''}
                  ${e.carriedFrom ? ' · von gestern' : ''}${e.movedTo ? ' · auf morgen verschoben' : ''}
                </div>`}
              </button>
            </li>`;
        })}
      </ul>
      <form class="task-form" onSubmit=${add}>
        <input placeholder="Neues Tagesziel" value=${title} onInput=${(e) => setTitle(e.target.value)} aria-label="Neues Tagesziel" />
        <div class="task-form-row">
          <select value=${goalId} onChange=${(e) => setGoalId(e.target.value)} aria-label="Mit Ziel verknüpfen">
            <option value="">ohne Ziel</option>
            ${areas.map((a) => html`
              <optgroup label=${a.name} key=${a.id}>
                ${store.goals.filter((g) => g.areaId === a.id && g.status === 'active').sort((x, y) => x.order - y.order)
                  .map((g) => html`<option value=${g.id}>${g.title}</option>`)}
              </optgroup>`)}
          </select>
          ${goal?.kind === 'number' && html`
            <input class="amount" inputmode="decimal" placeholder=${goal.unit} value=${amount}
              onInput=${(e) => setAmount(e.target.value)} aria-label="Menge in ${goal.unit}" />`}
          <button class="btn" type="submit">+</button>
        </div>
      </form>
    </section>`;
}

// ---------- Timetable ----------

// Überlappende Blöcke nebeneinander: Spalten pro zusammenhängender Gruppe.
function layoutColumns(items) {
  const sorted = [...items].sort((a, b) => a.range.start - b.range.start || b.range.end - a.range.end);
  const out = [];
  let cluster = [], cols = [], clusterEnd = -1;
  const flush = () => { cluster.forEach((c) => { c.cols = cols.length; }); out.push(...cluster); cluster = []; cols = []; };
  for (const item of sorted) {
    if (item.range.start >= clusterEnd && cluster.length) flush();
    let col = cols.findIndex((end) => end <= item.range.start);
    if (col < 0) { col = cols.length; cols.push(0); }
    cols[col] = item.range.end;
    cluster.push({ ...item, col });
    clusterEnd = Math.max(clusterEnd, item.range.end);
  }
  flush();
  return out;
}

function Timetable({ store, entries, nowMin, reload, onEdit, onStart, onAddBlock }) {
  const gridRef = useRef(null);
  const trayRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const live = entries.filter((e) => !e.movedTo);
  const scheduled = live.filter((e) => e.slot?.start).map((e) => ({ e, range: slotRange(e) }));
  const tray = live.filter((e) => !e.slot?.start && e.kind !== 'block' && !e.doneAt);
  const first = Math.min(6, ...scheduled.map((s) => Math.floor(s.range.start / 60)));
  const height = (24 - first) * HOUR_PX;
  const color = (e) => store.areas.find((a) => a.id === e.areaId)?.color || '#6e6782';
  const fixed = (e) => Boolean(store.routines.find((r) => r.id === e.routineId)?.fixed);

  const locate = (x, y) => {
    const g = gridRef.current.getBoundingClientRect();
    if (x >= g.left && x <= g.right && y >= g.top && y <= g.bottom) {
      const m = first * 60 + ((y - g.top) / HOUR_PX) * 60;
      return { minute: Math.max(first * 60, Math.min(1440 - SNAP, Math.round(m / SNAP) * SNAP)) };
    }
    const t = trayRef.current.getBoundingClientRect();
    if (x >= t.left && x <= t.right && y >= t.top && y <= t.bottom) return { tray: true };
    return {};
  };

  const handle = (entry) => ({
    class: 'tt-handle',
    'aria-label': `${entry.title} verschieben`,
    onPointerDown: (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch {}
      setDrag({ entry, x: ev.clientX, y: ev.clientY, ...locate(ev.clientX, ev.clientY) });
    },
    onPointerMove: (ev) => {
      if (!drag || drag.entry.id !== entry.id) return;
      if (ev.clientY < 90) scrollBy(0, -12);
      else if (ev.clientY > innerHeight - 140) scrollBy(0, 12);
      setDrag({ entry, x: ev.clientX, y: ev.clientY, ...locate(ev.clientX, ev.clientY) });
    },
    onPointerUp: async () => {
      const d = drag;
      setDrag(null);
      if (!d || d.entry.id !== entry.id) return;
      if (d.minute != null) {
        const len = d.entry.slot?.start ? slotRange(d.entry).end - slotRange(d.entry).start : DEFAULT_LEN[d.entry.kind];
        await updateEntry(d.entry.id, { slot: { start: fmtMin(d.minute), end: fmtMin(Math.min(d.minute + len, 1440)) } });
        reload();
      } else if (d.tray && d.entry.kind !== 'block') {
        await updateEntry(d.entry.id, { slot: null });
        reload();
      }
    },
    onPointerCancel: () => setDrag(null),
  });

  const tap = (e) => (e.areaId && !e.doneAt ? onStart(e) : onEdit(e));

  return html`
    <section class="panel">
      <div class="panel-head">
        <h2 class="label">Timetable</h2>
        <button class="btn secondary small-btn" onClick=${onAddBlock}>+ Block</button>
      </div>
      <div class="tray ${drag?.tray ? 'over' : ''}" ref=${trayRef}>
        ${tray.length === 0
          ? html`<span class="muted small">Alles hat eine Uhrzeit. Zum Entfernen einen Block hierher ziehen.</span>`
          : tray.map((e) => html`
            <div class="chip ${drag?.entry.id === e.id ? 'dragging' : ''}" key=${e.id} style="--c:${color(e)}">
              <span ...${handle(e)}>⠿</span>
              <button class="plain chip-text" onClick=${() => onEdit(e)}>${e.title}</button>
            </div>`)}
      </div>
      <div class="tt-grid" ref=${gridRef} style="height:${height}px">
        ${Array.from({ length: 24 - first }, (_, i) => html`
          <div class="tt-hour" key=${i} style="top:${i * HOUR_PX}px"><span class="num">${pad(first + i)}</span></div>`)}
        ${nowMin >= first * 60 && html`<div class="tt-now" style="top:${((nowMin - first * 60) / 60) * HOUR_PX}px"></div>`}
        ${layoutColumns(scheduled).map(({ e, range, col, cols }) => {
          const top = ((range.start - first * 60) / 60) * HOUR_PX;
          const h = Math.max(30, ((Math.min(range.end, 1440) - range.start) / 60) * HOUR_PX - 2);
          return html`
            <div key=${e.id} class="tt-block kind-${e.kind} ${e.doneAt ? 'done' : ''} ${drag?.entry.id === e.id ? 'dragging' : ''}"
              style="top:${top}px;height:${h}px;--col:${col};--cols:${cols};--c:${color(e)}">
              ${!fixed(e) && html`<span ...${handle(e)}>⠿</span>`}
              <button class="plain tt-body" onClick=${() => tap(e)}
                aria-label="${e.title}${e.areaId && !e.doneAt ? ', Session starten' : ''}">
                <span class="tt-title">${e.doneAt ? '✓ ' : ''}${e.title}</span>
                <span class="tt-time num">${e.slot.start}${e.slot.end ? `–${e.slot.end}` : ''}${e.areaId && !e.doneAt ? ' · ▶' : ''}</span>
              </button>
              <button class="plain tt-more" onClick=${() => onEdit(e)} aria-label="${e.title} bearbeiten">⋯</button>
            </div>`;
        })}
        ${drag?.minute != null && html`
          <div class="tt-drop" style="top:${((drag.minute - first * 60) / 60) * HOUR_PX}px"><span class="num">${fmtMin(drag.minute)}</span></div>`}
      </div>
      <p class="muted small tt-hint">Tipp auf einen Block mit Bereich startet die Session. ⋯ bearbeitet.</p>
      ${drag && html`<div class="chip ghost" style="left:${drag.x}px;top:${drag.y}px;--c:${color(drag.entry)}">${drag.entry.title}</div>`}
    </section>`;
}

// ---------- Sessions heute und Stunden ----------

function SessionsToday({ store, onEdit, onAdd }) {
  const list = store.sessions.filter((s) => s.date === store.today).sort((a, b) => a.startAt - b.startAt);
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  const ranges = [
    ['Heute', hoursByArea(store, store.today, store.today)],
    ['Woche', hoursByArea(store, weekStart(store.today), store.today)],
    ['Gesamt', hoursByArea(store, '0000-00-00', '9999-12-31')],
  ];
  return html`
    <section class="panel">
      <div class="panel-head">
        <h2 class="label">Sessions</h2>
        <button class="btn secondary small-btn" onClick=${onAdd}>+ Nachtragen</button>
      </div>
      ${list.length === 0 && html`<p class="muted small">Heute noch keine Session.</p>`}
      <ul class="list">
        ${list.map((s) => html`
          <li key=${s.id}>
            <button class="plain session-row" onClick=${() => onEdit(s)}>
              <span class="num muted small">${hhmm(s.startAt)}–${s.endAt ? hhmm(s.endAt) : 'läuft'}</span>
              <span class="session-row-main">${targetLabel(store, s)}</span>
              <span class="num">${hours(sessionDuration(s) / 3_600_000)}</span>
              ${s.note && html`<span class="muted small session-note">${s.note}</span>`}
            </button>
          </li>`)}
      </ul>
      <table class="hours num">
        <thead><tr><th></th>${ranges.map(([l]) => html`<th>${l}</th>`)}</tr></thead>
        <tbody>
          ${areas.map((a) => html`
            <tr key=${a.id}><th><span class="swatch" style="background:${a.color}"></span>${a.name}</th>
              ${ranges.map(([, h]) => html`<td>${h[a.id] ? hours(h[a.id]) : '–'}</td>`)}</tr>`)}
        </tbody>
      </table>
    </section>`;
}

// ---------- Sheets ----------

function EntrySheet({ store, entry, reload, notify, onStart, onClose }) {
  const [title, setTitle] = useState(entry.title);
  const [start, setStart] = useState(entry.slot?.start || '');
  const [end, setEnd] = useState(entry.slot?.end || '');
  const routine = store.routines.find((r) => r.id === entry.routineId);
  const editableTitle = entry.kind !== 'routine';

  const save = async () => {
    const slot = start ? { start, end: end || fmtMin(Math.min(toMin(start) + DEFAULT_LEN[entry.kind], 1440)) } : null;
    await updateEntry(entry.id, { title: editableTitle ? title.trim() || entry.title : entry.title, slot });
    await reload();
    onClose();
  };
  const toggle = async () => {
    await setEntryDone(entry.id, !entry.doneAt);
    await reload();
    onClose();
  };
  const remove = async () => {
    if (!confirm(`„${entry.title}“ löschen?`)) return;
    await deleteEntry(entry.id);
    await reload();
    notify('Gelöscht.');
    onClose();
  };
  const start_ = async () => { onClose(); await onStart(entry); };

  return html`
    <${Sheet} title=${entry.kind === 'block' ? 'Block' : entry.kind === 'routine' ? 'Routine' : 'Tagesziel'} onClose=${onClose}>
      ${editableTitle
        ? html`<label class="field">Titel<input value=${title} onInput=${(e) => setTitle(e.target.value)} /></label>`
        : html`<p><b>${entry.title}</b><br /><span class="muted small">Mindestens: ${routine?.minVersion}</span></p>`}
      ${entry.areaId && html`<p class="muted small">${targetLabel(store, entry)}</p>`}
      ${routine?.fixed
        ? html`<p class="muted small">Feste Zeit: ${entry.slot?.start} Uhr (NY-Open, automatisch umgerechnet)</p>`
        : html`
          <div class="form-grid">
            <label class="field">Von<input type="time" value=${start} onInput=${(e) => setStart(e.target.value)} /></label>
            <label class="field">Bis<input type="time" value=${end} onInput=${(e) => setEnd(e.target.value)} /></label>
          </div>
          ${entry.kind !== 'block' && start && html`<button class="link small" onClick=${() => { setStart(''); setEnd(''); }}>Ohne Uhrzeit</button>`}`}
      <div class="row sheet-actions">
        ${!routine?.fixed && html`<button class="btn" onClick=${save}>Speichern</button>`}
        ${entry.kind !== 'block' && html`<button class="btn secondary" onClick=${toggle}>${entry.doneAt ? 'Doch offen' : 'Erledigt'}</button>`}
        ${entry.areaId && !entry.doneAt && html`<button class="btn secondary" onClick=${start_}>Session starten</button>`}
        ${entry.kind !== 'routine' && html`<button class="btn secondary danger" onClick=${remove}>Löschen</button>`}
      </div>
    <//>`;
}

function BlockSheet({ store, reload, onClose, nowMin }) {
  const area = [...store.areas].sort((a, b) => a.order - b.order)[0];
  const [target, setTarget] = useState({ areaId: area?.id ?? null, goalId: null });
  const next = Math.min(23 * 60, Math.ceil((nowMin + 1) / 60) * 60);
  const [start, setStart] = useState(fmtMin(next));
  const [end, setEnd] = useState(fmtMin(Math.min(next + 60, 1440)));
  const save = async () => {
    if (!start) return;
    const goal = store.goals.find((g) => g.id === target.goalId);
    const title = goal ? goal.title : store.areas.find((a) => a.id === target.areaId)?.name || 'Block';
    await addBlock(store.today, { title, ...target, start, end: end || fmtMin(Math.min(toMin(start) + 60, 1440)) });
    await reload();
    onClose();
  };
  return html`
    <${Sheet} title="Zeitblock" onClose=${onClose}>
      <${TargetPicker} store=${store} value=${target} onChange=${setTarget} />
      <div class="form-grid">
        <label class="field">Von<input type="time" value=${start} onInput=${(e) => setStart(e.target.value)} /></label>
        <label class="field">Bis<input type="time" value=${end} onInput=${(e) => setEnd(e.target.value)} /></label>
      </div>
      <div class="row sheet-actions"><button class="btn" onClick=${save}>Block anlegen</button></div>
    <//>`;
}

function ReviewSheet({ store, reload, notify, onClose }) {
  const entries = store.entries.filter((e) => e.date === store.today && e.kind !== 'block');
  const done = entries.filter((e) => e.doneAt);
  const openRoutines = entries.filter((e) => !e.doneAt && e.kind === 'routine');
  const openTasks = entries.filter((e) => !e.doneAt && e.kind === 'task' && !e.movedTo);
  const [carry, setCarry] = useState(() => Object.fromEntries(openTasks.map((e) => [e.id, true])));
  const day = store.days.find((d) => d.date === store.today);
  const status = dayStatus(store, store.today);
  const sessionH = Object.values(hoursByArea(store, store.today, store.today)).reduce((a, b) => a + b, 0);

  const finish = async () => {
    const ids = openTasks.filter((e) => carry[e.id]).map((e) => e.id);
    if (ids.length) await carryOver(store.today, ids);
    else await markReviewed(store.today);
    await reload();
    notify(ids.length ? `${ids.length} auf morgen verschoben.` : 'Rückblick abgeschlossen.');
    onClose();
  };

  return html`
    <${Sheet} title="Abendrückblick" onClose=${onClose}>
      <p class=${status.fulfilled ? 'ok-text' : 'muted'}>
        ${status.fulfilled ? 'Plan erfüllt – der Garten wächst.' : 'Plan heute nicht ganz erfüllt.'}
      </p>
      <dl class="kv small">
        <dt>Wasser</dt><dd>${liters(waterTotal(day))} / ${liters(waterGoal(day, store.settings))} l</dd>
        <dt>Fotos</dt><dd>${status.parts.photos[0]} / 5</dd>
        <dt>Sessions</dt><dd>${hours(sessionH)}</dd>
      </dl>
      ${done.length > 0 && html`
        <h3 class="sub">Erledigt</h3>
        <ul class="plain-list">${done.map((e) => html`<li key=${e.id}>✓ ${e.title}</li>`)}</ul>`}
      ${openRoutines.length > 0 && html`
        <h3 class="sub">Offene Routinen</h3>
        <ul class="plain-list muted">${openRoutines.map((e) => html`<li key=${e.id}>${e.title}</li>`)}</ul>`}
      ${openTasks.length > 0 && html`
        <h3 class="sub">Offene Tagesziele – auf morgen verschieben?</h3>
        ${openTasks.map((e) => html`
          <label class="check-row" key=${e.id}>
            <input type="checkbox" checked=${carry[e.id]} onChange=${(ev) => setCarry({ ...carry, [e.id]: ev.target.checked })} />
            <span>${e.title}</span>
          </label>`)}`}
      <div class="row sheet-actions"><button class="btn" onClick=${finish}>Abschließen</button></div>
    <//>`;
}

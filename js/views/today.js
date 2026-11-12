// Tagesplan: Routinen, Tagesziele und Timetable sind dieselben Einträge, nur anders gezeigt.

import { html, useState } from '../vendor/preact-htm.js';
import {
  WINDOWS, activeSession, addBlock, addTask, carryOver, dayStatus, deleteEntry, hoursByArea,
  markReviewed, sessionDuration, setEntryDone, setPlanned, streak, updateEntry, waterGoal, waterTotal, weekStart,
} from '../model.js';
import { appMinutes, formatMinutes as fmtMin, hhmm, slotMinutes as toMin } from '../time.js';
import { Icon, Sheet, formatNumber } from '../ui.js';
import {
  EditSessionSheet, SessionCard, StartSheet, StopSheet, TargetPicker, startFromEntry, targetLabel, useTick,
} from './session.js';
import { ReminderBar } from './reminders.js';

const liters = (ml) => (ml / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`);

const DAY_FROM = 6 * 60;   // Liste beginnt frühestens um 6 Uhr …
const DAY_TO = 27 * 60;    // … und endet um 3 Uhr nachts (Tageswechsel)
const MIN_GAP = 30;        // kürzere Lücken werden nicht als „frei“ gezeigt
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
  const nowMin = appMinutes(now);
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
        <p class="muted small">Routinen sind schon drin. Ergänze Tagesziele und tipp im Timetable auf eine freie Zeit, um sie zu belegen.</p>
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
    <${Timetable} store=${store} entries=${entries} nowMin=${nowMin} running=${Boolean(session)}
      onEdit=${(e) => setSheet({ type: 'entry', entry: e })}
      onSession=${(s) => setSheet({ type: 'edit', session: s })}
      onStart=${startEntry}
      onSlot=${(from, to) => setSheet({ type: 'slot', from, to })} />
    <${Hours} store=${store} onAdd=${() => setSheet({ type: 'edit', session: null })} />

    ${day?.reviewedAt && html`
      <p class="center small"><button class="link" onClick=${() => setSheet({ type: 'review' })}>Rückblick erneut öffnen</button></p>`}
    ${!day?.reviewedAt && nowMin < reviewTime && html`
      <p class="center small"><button class="link" onClick=${() => setSheet({ type: 'review' })}>Rückblick jetzt schon öffnen</button></p>`}

    ${sheet?.type === 'start' && html`<${StartSheet} ...${ctx} onClose=${close} />`}
    ${sheet?.type === 'stop' && html`<${StopSheet} ...${ctx} session=${sheet.session} onClose=${close} />`}
    ${sheet?.type === 'edit' && html`<${EditSessionSheet} ...${ctx} session=${sheet.session} date=${today}
      start=${sheet.start} end=${sheet.end} onClose=${close} />`}
    ${sheet?.type === 'entry' && html`<${EntrySheet} ...${ctx} entry=${sheet.entry} onStart=${startEntry} onClose=${close} />`}
    ${sheet?.type === 'slot' && html`<${SlotSheet} ...${ctx} from=${sheet.from} to=${sheet.to} nowMin=${nowMin}
      onBackfill=${(start, end) => setSheet({ type: 'edit', session: null, start, end })} onClose=${close} />`}
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

// ---------- Timetable: Tagesliste ----------
//
// Geplante Einträge und Sessions nach Uhrzeit, dazwischen freie Zeiten zum Antippen.
// Zeiten vor 3 Uhr gehören ans Ende des Tages (nach Mitternacht).

const roundUp = (m, step = 15) => Math.ceil(m / step) * step;

function agendaItems(store, entries) {
  const planned = entries
    .filter((e) => e.slot?.start && !e.movedTo)
    .map((e) => ({ type: 'entry', id: e.id, e, ...slotRange(e) }));
  const sessions = store.sessions
    .filter((s) => s.date === store.today)
    .map((s) => ({ type: 'session', id: s.id, s, start: appMinutes(s.startAt), end: s.endAt ? appMinutes(s.endAt) : appMinutes(new Date()) }));
  return [...planned, ...sessions].sort((x, y) => x.start - y.start || (x.type === 'session' ? -1 : 1));
}

// Freie Zeiten ab jetzt bis zum Tagesende.
function freeGaps(items, nowMin) {
  const gaps = [];
  let cursor = Math.max(DAY_FROM, roundUp(nowMin));
  for (const it of [...items].sort((x, y) => x.start - y.start)) {
    if (it.start - cursor >= MIN_GAP) gaps.push({ type: 'gap', id: `gap-${cursor}`, start: cursor, end: it.start });
    cursor = Math.max(cursor, it.end);
  }
  if (DAY_TO - cursor >= MIN_GAP) gaps.push({ type: 'gap', id: `gap-${cursor}`, start: cursor, end: DAY_TO });
  return gaps;
}

function Timetable({ store, entries, nowMin, running, onEdit, onSession, onStart, onSlot }) {
  const items = agendaItems(store, entries);
  const rows = [...items, ...freeGaps(items, nowMin), { type: 'now', id: 'now', start: nowMin, end: nowMin }]
    .sort((x, y) => x.start - y.start || (x.type === 'now' ? -1 : y.type === 'now' ? 1 : 0));
  const unscheduled = entries.filter((e) => !e.slot?.start && e.kind !== 'block' && !e.doneAt && !e.movedTo);
  const area = (id) => store.areas.find((a) => a.id === id);
  const color = (id) => area(id)?.color || '#6e6782';
  const range = (it) => `${fmtMin(it.start)}–${fmtMin(it.end)}`;

  return html`
    <section class="panel">
      <div class="panel-head">
        <h2 class="label">Timetable</h2>
        <button class="btn secondary small-btn" onClick=${() => onSlot(roundUp(nowMin), DAY_TO)}>+ Eintrag</button>
      </div>
      <ol class="agenda">
        ${rows.map((it) => {
          if (it.type === 'now') {
            return html`<li key="now" class="agenda-now"><span class="num">${fmtMin(nowMin)}</span></li>`;
          }
          if (it.type === 'gap') {
            return html`
              <li key=${it.id}>
                <button class="plain agenda-gap" onClick=${() => onSlot(it.start, it.end)}>
                  <span>frei ${range(it)}</span><span class="agenda-plus" aria-hidden="true">+</span>
                </button>
              </li>`;
          }
          if (it.type === 'session') {
            const s = it.s;
            return html`
              <li key=${it.id} class="agenda-row session" style="--c:${color(s.areaId)}">
                <span class="agenda-time num">${fmtMin(it.start)}</span>
                <span class="agenda-mark ok-text" aria-hidden="true">${s.endAt ? '✓' : '●'}</span>
                <button class="plain agenda-main" onClick=${() => onSession(s)}>
                  <span class="agenda-title">Session · ${targetLabel(store, s)}</span>
                  <span class="agenda-sub num">${s.endAt ? range(it) : `seit ${fmtMin(it.start)}, läuft`} · ${hours(sessionDuration(s) / 3_600_000)}${s.manual ? ' · nachgetragen' : ''}${s.note ? ` · ${s.note}` : ''}</span>
                </button>
              </li>`;
          }
          const e = it.e;
          const canStart = e.areaId && !e.doneAt && !running;
          return html`
            <li key=${it.id} class="agenda-row ${e.doneAt ? 'done' : ''}" style="--c:${color(e.areaId)}">
              <span class="agenda-time num">${fmtMin(it.start)}</span>
              <span class="agenda-mark ${e.doneAt ? 'ok-text' : 'muted'}" aria-hidden="true">${e.doneAt ? '✓' : '○'}</span>
              <button class="plain agenda-main" onClick=${() => onEdit(e)} aria-label="${e.title} bearbeiten">
                <span class="agenda-title">${e.title}</span>
                <span class="agenda-sub num">${range(it)}${area(e.areaId) && area(e.areaId).name !== e.title ? ` · ${area(e.areaId).name}` : ''}</span>
              </button>
              ${canStart && html`<button class="agenda-play" onClick=${() => onStart(e)} aria-label="Session für ${e.title} starten">▶</button>`}
            </li>`;
        })}
      </ol>
      ${unscheduled.length > 0 && html`
        <div class="agenda-unscheduled">
          <span class="muted small">Ohne Uhrzeit:</span>
          ${unscheduled.map((e) => html`
            <button key=${e.id} class="chip plain-chip" style="--c:${color(e.areaId)}" onClick=${() => onEdit(e)}>${e.title}</button>`)}
        </div>`}
    </section>`;
}

// ---------- Stunden ----------

function Hours({ store, onAdd }) {
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  const ranges = [
    ['Heute', hoursByArea(store, store.today, store.today)],
    ['Woche', hoursByArea(store, weekStart(store.today), store.today)],
    ['Gesamt', hoursByArea(store, '0000-00-00', '9999-12-31')],
  ];
  return html`
    <section class="panel">
      <div class="panel-head">
        <h2 class="label">Stunden</h2>
        <button class="btn secondary small-btn" onClick=${onAdd}>+ Session nachtragen</button>
      </div>
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

const LENGTHS = [15, 30, 45, 60, 90, 120];

// Eintrag bearbeiten: Name und Zeit ändern, Session starten, abhaken, löschen.
function EntrySheet({ store, entry, reload, notify, onStart, onClose }) {
  const [title, setTitle] = useState(entry.title);
  const [start, setStart] = useState(entry.slot?.start || '');
  const [end, setEnd] = useState(entry.slot?.end || (entry.slot?.start ? fmtMin(slotRange(entry).end) : ''));
  const routine = store.routines.find((r) => r.id === entry.routineId);
  const length = start && end ? ((toMin(end) - toMin(start)) + 1440) % 1440 : null;
  const setLength = (min) => { if (start) setEnd(fmtMin(toMin(start) + min)); };

  const save = async () => {
    const slot = start ? { start, end: end || fmtMin(toMin(start) + DEFAULT_LEN[entry.kind]) } : null;
    await updateEntry(entry.id, { title: title.trim() || entry.title, slot });
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
  const startNow = async () => { onClose(); await onStart(entry); };

  return html`
    <${Sheet} title=${entry.kind === 'block' ? 'Block' : entry.kind === 'routine' ? 'Routine' : 'Tagesziel'} onClose=${onClose}>
      <label class="field">Name<input value=${title} onInput=${(e) => setTitle(e.target.value)} /></label>
      ${routine && html`<p class="muted small">Mindestens: ${routine.minVersion}${entry.kind === 'routine' ? ' · Name und Zeit gelten nur für heute.' : ''}</p>`}
      ${routine?.fixed && html`<p class="muted small">Normalerweise ${entry.slot?.start} Uhr (NY-Open, automatisch umgerechnet).</p>`}
      <div class="form-grid">
        <label class="field">Von<input type="time" value=${start} onInput=${(e) => setStart(e.target.value)} /></label>
        <label class="field">Bis<input type="time" value=${end} onInput=${(e) => setEnd(e.target.value)} /></label>
      </div>
      ${start && html`
        <div class="chips lengths" role="group" aria-label="Dauer">
          ${LENGTHS.map((m) => html`<button type="button" key=${m} class="pick ${length === m ? 'on' : ''}" onClick=${() => setLength(m)}>${m < 60 ? `${m} min` : `${m / 60} h`}</button>`)}
        </div>`}
      ${entry.kind !== 'block' && start && html`<button class="link small" onClick=${() => { setStart(''); setEnd(''); }}>Ohne Uhrzeit</button>`}
      <div class="row sheet-actions">
        <button class="btn" onClick=${save}>Speichern</button>
        ${entry.areaId && !entry.doneAt && html`<button class="btn secondary" onClick=${startNow}>▶ Session starten</button>`}
        ${entry.kind !== 'block' && html`<button class="btn secondary" onClick=${toggle}>${entry.doneAt ? 'Doch offen' : 'Erledigt'}</button>`}
        ${entry.kind !== 'routine' && html`<button class="btn secondary danger" onClick=${remove}>Löschen</button>`}
      </div>
    <//>`;
}

// Freie Zeit belegen: offenen Eintrag einplanen, neuen Block anlegen oder Session nachtragen.
function SlotSheet({ store, reload, from, to, nowMin, onBackfill, onClose }) {
  const [start, setStart] = useState(fmtMin(from));
  const [end, setEnd] = useState(fmtMin(Math.min(from + 60, to)));
  const [mode, setMode] = useState('pick');
  const first = [...store.areas].sort((a, b) => a.order - b.order)[0];
  const [target, setTarget] = useState({ areaId: first?.id ?? null, goalId: null });
  const [name, setName] = useState('');
  const open = store.entries.filter((e) => e.date === store.today && !e.slot?.start && e.kind !== 'block' && !e.doneAt && !e.movedTo);
  const past = toMin(start) < nowMin;

  const place = async (entry) => {
    await updateEntry(entry.id, { slot: { start, end } });
    await reload();
    onClose();
  };
  const createBlock = async () => {
    const goal = store.goals.find((g) => g.id === target.goalId);
    const title = name.trim() || goal?.title || store.areas.find((a) => a.id === target.areaId)?.name || 'Block';
    await addBlock(store.today, { title, ...target, start, end });
    await reload();
    onClose();
  };

  return html`
    <${Sheet} title="Zeit belegen" onClose=${onClose}>
      <div class="form-grid">
        <label class="field">Von<input type="time" value=${start} onInput=${(e) => setStart(e.target.value)} /></label>
        <label class="field">Bis<input type="time" value=${end} onInput=${(e) => setEnd(e.target.value)} /></label>
      </div>
      <div class="segmented slot-mode">
        <label class=${mode === 'pick' ? 'on' : ''}><input type="radio" name="slotmode" checked=${mode === 'pick'} onChange=${() => setMode('pick')} />Offener Eintrag</label>
        <label class=${mode === 'block' ? 'on' : ''}><input type="radio" name="slotmode" checked=${mode === 'block'} onChange=${() => setMode('block')} />Neuer Block</label>
      </div>
      ${mode === 'pick' && html`
        ${open.length === 0 && html`<p class="muted small">Alles hat schon eine Uhrzeit. Leg einen neuen Block an.</p>`}
        <div class="slot-list">
          ${open.map((e) => html`
            <button key=${e.id} class="slot-pick" style="--c:${store.areas.find((a) => a.id === e.areaId)?.color || '#6e6782'}" onClick=${() => place(e)}>
              ${e.title}<span class="muted small">${e.kind === 'routine' ? 'Routine' : 'Tagesziel'}</span>
            </button>`)}
        </div>`}
      ${mode === 'block' && html`
        <${TargetPicker} store=${store} value=${target} onChange=${setTarget} />
        <label class="field">Name <span class="muted">(optional)</span><input value=${name} onInput=${(e) => setName(e.target.value)} placeholder="z. B. TikToks schneiden" /></label>
        <div class="row sheet-actions"><button class="btn" onClick=${createBlock}>Block anlegen</button></div>`}
      ${past && html`
        <p class="small slot-backfill">Schon vorbei?
          <button class="link" onClick=${() => onBackfill(start, end)}>Als Session nachtragen</button></p>`}
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

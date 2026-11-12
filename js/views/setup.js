// Einrichten: Bereiche, Routinen und was als Arbeit zählt. Damit lässt sich die App
// ohne Programmieren an andere Ziele anpassen.

import { html, useState } from '../vendor/preact-htm.js';
import {
  WINDOWS, addArea, deleteArea, deleteRoutine, moveArea, saveRoutine, saveSettings, updateArea,
} from '../model.js';
import { Sheet } from '../ui.js';

export const LAYER_NAMES = {
  dirt: 'Erde', sand: 'Sand', stone: 'Stein', ice: 'Eis', deep: 'Tiefgestein', lava: 'Lava',
};
const COLORS = ['#8a5a32', '#b8925a', '#6f7480', '#4a8ab0', '#5a3482', '#b5443a', '#3e8948', '#d8a020'];
const WEEKDAYS = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
const ZONES = [
  ['', 'Gerätezeit'], ['America/New_York', 'New York'], ['America/Chicago', 'Chicago'], ['Europe/London', 'London'],
  ['Europe/Berlin', 'Berlin'], ['Asia/Bangkok', 'Bangkok'], ['Asia/Singapore', 'Singapur'], ['Asia/Tokyo', 'Tokio'],
];
const parseNum = (v) => parseFloat(String(v).replace(',', '.'));

// ---------- Bereiche ----------

export function AreasEditor({ store, reload, notify }) {
  const [edit, setEdit] = useState(null);
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  const move = async (id, dir) => { await moveArea(id, dir); reload(); };
  return html`
    <section class="panel">
      <div class="panel-head">
        <h2 class="label">Bereiche</h2>
        <button class="btn secondary small-btn" onClick=${() => setEdit({})}>+ Bereich</button>
      </div>
      <p class="muted small">Jeder Bereich ist eine Gesteinsschicht in der Welt, von oben nach unten.</p>
      ${areas.length === 0 && html`<p>Noch keine Bereiche. Leg deinen ersten an, z. B. „Sport“ oder „Studium“.</p>`}
      <ul class="list">
        ${areas.map((a, i) => html`
          <li key=${a.id} class="setup-row">
            <button class="plain setup-main" onClick=${() => setEdit(a)}>
              <span class="swatch" style="background:${a.color}"></span>
              <span><b>${a.name}</b><br /><span class="muted small">${LAYER_NAMES[a.layer] || a.layer} · ${store.goals.filter((g) => g.areaId === a.id && g.status !== 'archived').length} Ziele</span></span>
            </button>
            <button class="btn secondary icon" disabled=${i === 0} onClick=${() => move(a.id, -1)} aria-label="${a.name} nach oben">▲</button>
            <button class="btn secondary icon" disabled=${i === areas.length - 1} onClick=${() => move(a.id, 1)} aria-label="${a.name} nach unten">▼</button>
          </li>`)}
      </ul>
      ${edit && html`<${AreaSheet} area=${edit} store=${store} reload=${reload} notify=${notify} onClose=${() => setEdit(null)} />`}
    </section>`;
}

function AreaSheet({ area, store, reload, notify, onClose }) {
  const isNew = !area.id;
  const [name, setName] = useState(area.name || '');
  const [layer, setLayer] = useState(area.layer || 'stone');
  const [color, setColor] = useState(area.color || COLORS[store.areas.length % COLORS.length]);
  const goals = store.goals.filter((g) => g.areaId === area.id).length;

  const save = async () => {
    if (!name.trim()) return notify('Bitte einen Namen eingeben.', 'error');
    if (isNew) await addArea({ name, layer, color });
    else await updateArea(area.id, { name: name.trim(), layer, color });
    await reload();
    onClose();
  };
  const remove = async () => {
    const msg = goals
      ? `„${area.name}“ mit ${goals} ${goals === 1 ? 'Ziel' : 'Zielen'} löschen? Ziele, Zwischenziele und Notizen gehen verloren, Session-Stunden bleiben.`
      : `„${area.name}“ löschen?`;
    if (!confirm(msg)) return;
    await deleteArea(area.id);
    await reload();
    notify('Bereich gelöscht.');
    onClose();
  };

  return html`
    <${Sheet} title=${isNew ? 'Neuer Bereich' : 'Bereich'} onClose=${onClose}>
      <label class="field">Name<input value=${name} onInput=${(e) => setName(e.target.value)} placeholder="z. B. Studium" /></label>
      <p class="field-label">Gesteinsschicht</p>
      <div class="chips">
        ${Object.entries(LAYER_NAMES).map(([k, label]) => html`
          <button type="button" key=${k} class="pick ${layer === k ? 'on' : ''}" aria-pressed=${layer === k} onClick=${() => setLayer(k)}>${label}</button>`)}
      </div>
      <p class="field-label">Farbe</p>
      <div class="chips">
        ${COLORS.map((c) => html`
          <button type="button" key=${c} class="color-pick ${color === c ? 'on' : ''}" style="background:${c}" aria-label="Farbe ${c}" aria-pressed=${color === c} onClick=${() => setColor(c)}></button>`)}
      </div>
      <div class="row sheet-actions">
        <button class="btn" onClick=${save}>${isNew ? 'Bereich anlegen' : 'Speichern'}</button>
        ${!isNew && html`<button class="btn secondary danger" onClick=${remove}>Löschen</button>`}
      </div>
    <//>`;
}

// ---------- Routinen ----------

function routineWhen(r) {
  const days = r.weekdays && r.weekdays.length < 7
    ? ` · ${WEEKDAYS.filter(([d]) => r.weekdays.includes(d)).map(([, l]) => l).join(', ')}` : '';
  if (r.fixed) {
    const zone = ZONES.find(([z]) => z === (r.fixed.timeZone || ''))?.[1] || r.fixed.timeZone;
    return `${r.fixed.time}${r.fixed.timeZone ? ` ${zone}` : ''}${days}`;
  }
  return `${WINDOWS[r.window]}${days}`;
}

export function RoutinesEditor({ store, reload, notify }) {
  const [edit, setEdit] = useState(null);
  const routines = [...store.routines].sort((a, b) => a.order - b.order);
  const area = (id) => store.areas.find((a) => a.id === id);
  const goal = (id) => store.goals.find((g) => g.id === id);
  return html`
    <section class="panel">
      <div class="panel-head">
        <h2 class="label">Routinen</h2>
        <button class="btn secondary small-btn" onClick=${() => setEdit({})}>+ Routine</button>
      </div>
      <p class="muted small">Erscheinen jeden Tag automatisch im Tagesplan und als Laterne auf der Wiese.</p>
      ${routines.length === 0 && html`<p>Noch keine Routinen.</p>`}
      <ul class="list">
        ${routines.map((r) => html`
          <li key=${r.id}>
            <button class="plain setup-main wide-row" onClick=${() => setEdit(r)}>
              <span class="goal-title"><span>${r.title}${!r.active ? html` <span class="muted small">(pausiert)</span>` : ''}</span>
                <span class="muted small">${routineWhen(r)}</span></span>
              <span class="muted small">Mindestens: ${r.minVersion || '–'}${r.bonus ? ` · Bonus: ${r.bonus}` : ''}${area(r.areaId) ? ` · ${area(r.areaId).name}${goal(r.goalId) ? `: ${goal(r.goalId).title}` : ''}` : ''}</span>
            </button>
          </li>`)}
      </ul>
      ${edit && html`<${RoutineSheet} routine=${edit} store=${store} reload=${reload} notify=${notify} onClose=${() => setEdit(null)} />`}
    </section>`;
}

function RoutineSheet({ routine, store, reload, notify, onClose }) {
  const isNew = !routine.id;
  const [f, setF] = useState(() => ({
    title: routine.title || '', minVersion: routine.minVersion || '', bonus: routine.bonus || '',
    window: routine.fixed ? 'fixed' : routine.window || 'morning',
    time: routine.fixed?.time || '09:00', timeZone: routine.fixed?.timeZone || '',
    weekdays: routine.weekdays || [0, 1, 2, 3, 4, 5, 6],
    areaId: routine.areaId || '', goalId: routine.goalId || '', active: routine.active !== false,
  }));
  const set = (key, value) => setF((x) => ({ ...x, [key]: value }));
  const input = (key) => ({ value: f[key], onInput: (e) => set(key, e.target.value) });
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  const goals = store.goals.filter((g) => g.areaId === f.areaId && g.status !== 'archived');
  const toggleDay = (d) => setF((x) => ({ ...x, weekdays: x.weekdays.includes(d) ? x.weekdays.filter((y) => y !== d) : [...x.weekdays, d] }));

  const save = async () => {
    if (!f.title.trim()) return notify('Bitte einen Titel eingeben.', 'error');
    if (!f.weekdays.length) return notify('Mindestens ein Wochentag.', 'error');
    const fixed = f.window === 'fixed';
    await saveRoutine({
      ...routine,
      title: f.title.trim(), minVersion: f.minVersion.trim(), bonus: f.bonus.trim(),
      window: fixed ? 'fixed' : f.window,
      fixed: fixed ? { time: f.time, timeZone: f.timeZone || null } : null,
      weekdays: f.weekdays.length === 7 ? null : [...f.weekdays].sort(),
      areaId: f.areaId || null, goalId: (f.areaId && f.goalId) || null, active: f.active,
    });
    await reload();
    notify(isNew ? 'Routine angelegt.' : 'Routine gespeichert.');
    onClose();
  };
  const remove = async () => {
    if (!confirm(`Routine „${routine.title}“ löschen? Vergangene Tage bleiben im Kalender.`)) return;
    await deleteRoutine(routine.id);
    await reload();
    notify('Routine gelöscht.');
    onClose();
  };

  return html`
    <${Sheet} title=${isNew ? 'Neue Routine' : 'Routine'} onClose=${onClose}>
      <label class="field">Titel<input ...${input('title')} placeholder="z. B. Lesen" /></label>
      <label class="field">Mindestversion<input ...${input('minVersion')} placeholder="z. B. 1 Kapitel" /></label>
      <label class="field">Bonus <span class="muted">(optional)</span><input ...${input('bonus')} placeholder="z. B. 30 Minuten" /></label>
      <p class="field-label">Wann</p>
      <div class="chips">
        ${Object.entries(WINDOWS).map(([k, label]) => html`
          <button type="button" key=${k} class="pick ${f.window === k ? 'on' : ''}" onClick=${() => set('window', k)}>${label}</button>`)}
      </div>
      ${f.window === 'fixed' && html`
        <div class="form-grid">
          <label class="field">Uhrzeit<input type="time" ...${input('time')} /></label>
          <label class="field">Zeitzone
            <select value=${f.timeZone} onChange=${(e) => set('timeZone', e.target.value)}>
              ${ZONES.map(([z, label]) => html`<option value=${z}>${label}</option>`)}
            </select>
          </label>
        </div>
        ${f.timeZone && html`<p class="muted small">Wird automatisch in deine Ortszeit umgerechnet, auch bei Zeitumstellung.</p>`}`}
      <p class="field-label">Wochentage${f.window === 'fixed' && f.timeZone ? ' (in dieser Zeitzone)' : ''}</p>
      <div class="chips">
        ${WEEKDAYS.map(([d, label]) => html`
          <button type="button" key=${d} class="pick ${f.weekdays.includes(d) ? 'on' : ''}" aria-pressed=${f.weekdays.includes(d)} onClick=${() => toggleDay(d)}>${label}</button>`)}
      </div>
      <div class="form-grid">
        <label class="field">Bereich
          <select value=${f.areaId} onChange=${(e) => { set('areaId', e.target.value); set('goalId', ''); }}>
            <option value="">keiner</option>
            ${areas.map((a) => html`<option value=${a.id}>${a.name}</option>`)}
          </select>
        </label>
        <label class="field">Ziel
          <select value=${f.goalId} onChange=${(e) => set('goalId', e.target.value)} disabled=${!f.areaId}>
            <option value="">keins</option>
            ${goals.map((g) => html`<option value=${g.id}>${g.title}</option>`)}
          </select>
        </label>
      </div>
      <label class="check-row"><input type="checkbox" checked=${!f.active} onChange=${(e) => set('active', !e.target.checked)} /><span>Pausiert (erscheint nicht im Tagesplan)</span></label>
      <div class="row sheet-actions">
        <button class="btn" onClick=${save}>${isNew ? 'Routine anlegen' : 'Speichern'}</button>
        ${!isNew && html`<button class="btn secondary danger" onClick=${remove}>Löschen</button>`}
      </div>
    <//>`;
}

// ---------- Was als Arbeit zählt ----------

export function WorkSettings({ store, reload, notify }) {
  const s = store.settings;
  const [ids, setIds] = useState(() => s.workAreaIds || []);
  const [goal, setGoal] = useState(String(s.workGoalHours));
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  const toggle = (id) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const save = async () => {
    const h = parseNum(goal);
    if (!(h > 0 && h <= 16)) return notify('Stunden bitte zwischen 0 und 16.', 'error');
    await saveSettings({ workAreaIds: ids, workGoalHours: h });
    await reload();
    notify('Gespeichert.');
  };
  return html`
    <section class="panel">
      <h2 class="label">Arbeit</h2>
      <p class="muted small">Session-Stunden dieser Bereiche zählen im Kalender als Arbeit (50 % der Tageswertung). Ein Gold-Tag braucht alle Routinen, volles Wasser und so viele Stunden Arbeit.</p>
      ${areas.length === 0 && html`<p class="muted small">Leg zuerst Bereiche an.</p>`}
      ${areas.map((a) => html`
        <label class="check-row" key=${a.id}>
          <input type="checkbox" checked=${ids.includes(a.id)} onChange=${() => toggle(a.id)} />
          <span><span class="swatch inline-swatch" style="background:${a.color}"></span>${a.name}</span>
        </label>`)}
      <div class="row work-goal">
        <label class="field">Stunden für einen Gold-Tag<input inputmode="decimal" value=${goal} onInput=${(e) => setGoal(e.target.value)} /></label>
      </div>
      <button class="btn" onClick=${save}>Speichern</button>
    </section>`;
}

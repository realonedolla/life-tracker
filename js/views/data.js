// Daten-Ansicht: Sicherung, Einstellungen, Ziele und Routinen, Zeitumrechnung, Speicher.

import { html, useEffect, useState } from '../vendor/preact-htm.js';
import {
  COUNT_MODES, GOAL_KINDS, addGoalValue, goalValue, saveSettings,
} from '../model.js';
import { sunTimes } from '../sun.js';
import { REMINDERS } from '../reminders.js';
import { addDays, deviceTimeZone, formatDate, hhmm, zonedTimeOnLocalDay } from '../time.js';
import { applyBackup, exportBackup, readBackup } from '../backup.js';
import { formatBytes, formatNumber } from '../ui.js';
import { AreasEditor, RoutinesEditor, WorkSettings } from './setup.js';
import { FriendsSetup } from './friends.js';

const STORE_LABELS = {
  areas: 'Bereiche',
  goals: 'Ziele',
  milestones: 'Zwischenziele',
  goalNotes: 'Ziel-Notizen',
  goalValues: 'Wert-Einträge',
  routines: 'Routinen',
  days: 'Tage',
  entries: 'Tagesplan-Einträge',
  sessions: 'Sessions',
  photos: 'Fotos',
  ideas: 'Ideen',
};

const DAY_MS = 86_400_000;

export function DataView({ store, reload, notify }) {
  return html`
    <${Backup} store=${store} reload=${reload} notify=${notify} />
    <${FriendsSetup} store=${store} notify=${notify} />
    <${AreasEditor} store=${store} reload=${reload} notify=${notify} />
    <${RoutinesEditor} store=${store} reload=${reload} notify=${notify} />
    <${WorkSettings} store=${store} reload=${reload} notify=${notify} />
    <${Settings} store=${store} reload=${reload} notify=${notify} />
    <${ReminderSettings} store=${store} reload=${reload} notify=${notify} />
    <${Goals} store=${store} reload=${reload} notify=${notify} />
    <${TimeInfo} store=${store} />
    <${StorageInfo} store=${store} />`;
}

// ---------- Sicherung ----------

function Backup({ store, reload, notify }) {
  const [busy, setBusy] = useState(false);
  const days = store.lastExportAt ? Math.floor((Date.now() - store.lastExportAt) / DAY_MS) : null;
  const overdue = days == null || days > store.settings.exportReminderDays;

  async function onExport() {
    setBusy(true);
    try {
      const result = await exportBackup();
      if (result) notify(`Gesichert: ${result.name} (${formatBytes(result.size)})`);
      reload();
    } catch (err) {
      notify(`Export fehlgeschlagen: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onImport(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const backup = await readBackup(file);
      const lines = Object.entries(backup.counts)
        .filter(([name]) => STORE_LABELS[name])
        .map(([name, n]) => `${STORE_LABELS[name]}: ${n}`);
      const when = new Date(backup.exportedAt).toLocaleString('de-DE');
      const ok = confirm(`Sicherung vom ${when} laden?\n\n${lines.join('\n')}\n\nAlle Daten auf diesem Gerät werden dadurch ersetzt.`);
      if (!ok) return;
      await applyBackup(backup);
      await reload();
      notify('Sicherung geladen.');
    } catch (err) {
      notify(`Import fehlgeschlagen: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return html`
    <section class="panel">
      <h2 class="label">Sicherung</h2>
      <p class=${overdue ? 'warn' : 'muted'}>
        ${days == null ? 'Noch keine Sicherung erstellt.'
          : days === 0 ? 'Letzte Sicherung: heute.'
          : `Letzte Sicherung vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}.`}
      </p>
      <p class="muted small">Eine Datei mit allen Daten und Fotos. Am iPhone über „In Dateien sichern“ ablegen.</p>
      <div class="row">
        <button class="btn" onClick=${onExport} disabled=${busy}>Exportieren</button>
        <label class="btn secondary" aria-disabled=${busy}>
          Importieren
          <input class="visually-hidden" type="file" accept=".zip,application/zip" onChange=${onImport} disabled=${busy} />
        </label>
      </div>
    </section>`;
}

// ---------- Einstellungen ----------

const parseNum = (v) => parseFloat(String(v).replace(',', '.'));

function Settings({ store, reload, notify }) {
  const { location, waterGoalMl } = store.settings;
  const [form, setForm] = useState({
    name: location.name, lat: String(location.lat), lon: String(location.lon), water: String(waterGoalMl / 1000),
  });
  const field = (key) => ({ value: form[key], onInput: (e) => { const v = e.target.value; setForm((f) => ({ ...f, [key]: v })); } });
  const times = sunTimes(new Date(), location.lat, location.lon);

  async function onSave(event) {
    event.preventDefault();
    const lat = parseNum(form.lat), lon = parseNum(form.lon), water = parseNum(form.water);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return notify('Breiten- oder Längengrad stimmt nicht.', 'error');
    if (!(water > 0 && water < 20)) return notify('Wasserziel bitte in Litern, z. B. 4.', 'error');
    await saveSettings({ location: { name: form.name.trim() || 'Ort', lat, lon }, waterGoalMl: Math.round(water * 1000) });
    await reload();
    notify('Einstellungen gespeichert.');
  }

  return html`
    <section class="panel">
      <h2 class="label">Einstellungen</h2>
      <form class="settings" onSubmit=${onSave}>
        <label>Ort für den Himmel<input ...${field('name')} /></label>
        <div class="settings-pair">
          <label>Breitengrad<input inputmode="decimal" ...${field('lat')} /></label>
          <label>Längengrad<input inputmode="decimal" ...${field('lon')} /></label>
        </div>
        <label>Wasser-Tagesziel (Liter)<input inputmode="decimal" ...${field('water')} /></label>
        <p class="muted small">
          ${location.name} heute: Sonnenaufgang ${hhmm(times.sunrise)} Uhr, Sonnenuntergang ${hhmm(times.sunset)} Uhr.
          Das Wasserziel einzelner Tage änderst du mit einem Tipp auf die Literzahl am Krug.
        </p>
        <button class="btn" type="submit">Speichern</button>
      </form>
    </section>`;
}

// ---------- Erinnerungen ----------

function ReminderSettings({ store, reload, notify }) {
  const s = store.settings;
  const [form, setForm] = useState(() => ({
    reminders: Object.fromEntries(REMINDERS.map((r) => [r.id, s.reminders?.[r.id] !== false])),
    planTime: s.planTime, waterTime: s.waterTime, eveningTime: s.eveningTime, reviewTime: s.reviewTime,
    sessionLongHours: String(s.sessionLongHours),
  }));
  const toggle = (id) => setForm((f) => ({ ...f, reminders: { ...f.reminders, [id]: !f.reminders[id] } }));
  const setTime = (key) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, [key]: v })); };

  async function onSave(event) {
    event.preventDefault();
    const hours = parseNum(form.sessionLongHours);
    if (!(hours > 0 && hours < 24)) return notify('Session-Dauer bitte in Stunden, z. B. 3.', 'error');
    const times = ['planTime', 'waterTime', 'eveningTime', 'reviewTime'];
    if (times.some((k) => !/^\d\d:\d\d$/.test(form[k]))) return notify('Bitte alle Uhrzeiten ausfüllen.', 'error');
    await saveSettings({ ...Object.fromEntries(times.map((k) => [k, form[k]])), reminders: form.reminders, sessionLongHours: hours });
    await reload();
    notify('Erinnerungen gespeichert.');
  }

  return html`
    <section class="panel">
      <h2 class="label">Erinnerungen</h2>
      <p class="muted small">Erscheinen oben in Welt und Heute, sobald sie fällig sind, und kurz als Meldung, wenn die App gerade offen ist. Bei geschlossener App gibt es keine Mitteilungen.</p>
      <form class="settings reminder-settings" onSubmit=${onSave}>
        ${REMINDERS.map((r) => html`
          <div class="reminder-row" key=${r.id}>
            <label class="check-row">
              <input type="checkbox" checked=${form.reminders[r.id]} onChange=${() => toggle(r.id)} />
              <span><b>${r.label}</b><br /><span class="muted small">${r.hint}</span></span>
            </label>
            ${r.time && html`<input type="time" value=${form[r.time]} onInput=${setTime(r.time)} aria-label="Uhrzeit ${r.label}" disabled=${!form.reminders[r.id]} />`}
            ${r.id === 'session' && html`<span class="hours-wrap"><input class="hours-input" inputmode="decimal" value=${form.sessionLongHours} aria-label="Stunden"
              onInput=${(e) => { const v = e.target.value; setForm((f) => ({ ...f, sessionLongHours: v })); }} disabled=${!form.reminders.session} /> h</span>`}
          </div>`)}
        <button class="btn" type="submit">Speichern</button>
      </form>
    </section>`;
}

// ---------- Bereiche und Ziele ----------

function Goals({ store, reload, notify }) {
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  return html`
    <section class="panel">
      <h2 class="label">Ziele</h2>
      ${areas.map((area) => {
        const goals = store.goals.filter((g) => g.areaId === area.id).sort((a, b) => a.order - b.order);
        return html`
          <div key=${area.id}>
            <div class="area-head">
              <span class="swatch" style="background:${area.color}"></span>
              <span class="label">${area.name}</span>
            </div>
            <ul class="list">
              ${goals.map((goal) => html`
                <${GoalRow} key=${goal.id} goal=${goal} pinned=${area.pinnedGoalId === goal.id}
                  store=${store} reload=${reload} notify=${notify} />`)}
            </ul>
          </div>`;
      })}
    </section>`;
}

function GoalRow({ goal, pinned, store, reload, notify }) {
  const [input, setInput] = useState('');
  const steps = store.milestones.filter((m) => m.goalId === goal.id).sort((a, b) => a.order - b.order);
  const notes = store.goalNotes.filter((n) => n.goalId === goal.id);
  const isNumber = goal.kind === 'number';
  const value = isNumber ? goalValue(goal, store.goalValues) : null;
  const doneSteps = steps.filter((s) => s.doneAt).length;

  async function onAdd(event) {
    event.preventDefault();
    const n = parseFloat(input.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    const result = await addGoalValue(goal.id, n, { type: 'manual' });
    setInput('');
    const found = result.reached.map((m) => m.title).join(', ');
    notify(`${goal.title}: ${formatNumber(result.total)}${found ? ` · freigelegt: ${found}` : ''}`);
    reload();
  }

  const kind = GOAL_KINDS[goal.kind] + (goal.countMode ? ` · ${COUNT_MODES[goal.countMode]}` : '');
  const placeholder = goal.countMode === 'sum' ? `+ ${goal.unit}` : `neuer ${COUNT_MODES[goal.countMode]}`;

  return html`
    <li>
      <div class="goal-title">
        <span><a class="link" href="#/ziel/${goal.id}">${goal.title}</a>${pinned && html` <span class="pin small">· angepinnt</span>`}</span>
        <span class="num muted">${isNumber ? `${formatNumber(value)}/${formatNumber(goal.target)}` : `${doneSteps}/${steps.length}`}</span>
      </div>
      <div class="muted small">${kind}${goal.status === 'done' ? ' · geschafft' : goal.status === 'archived' ? ' · archiviert' : ''}</div>
      ${isNumber && html`<div class="bar"><span style="width:${Math.min(100, (value / goal.target) * 100)}%"></span></div>`}
      <ul class="steps">
        ${steps.map((s) => html`<li key=${s.id} class=${s.doneAt ? 'done' : ''}>${s.title}</li>`)}
      </ul>
      ${notes.map((n) => html`<p key=${n.id} class="muted small" style="margin:6px 0 0">${n.text}</p>`)}
      ${isNumber && html`
        <form class="inline-form" onSubmit=${onAdd}>
          <input inputmode="decimal" placeholder=${placeholder} value=${input}
            onInput=${(e) => setInput(e.target.value)} aria-label="Wert für ${goal.title}" />
          <button class="btn secondary" type="submit">Eintragen</button>
        </form>`}
    </li>`;
}

// ---------- Zeit ----------

// Sucht ab heute den nächsten Tag, an dem die NY-Open lokal zu einer anderen Uhrzeit liegt.
function nextShift(today, time, timeZone) {
  const base = hhmm(zonedTimeOnLocalDay(today, time, timeZone));
  for (let i = 1; i < 370; i++) {
    const key = addDays(today, i);
    const at = zonedTimeOnLocalDay(key, time, timeZone);
    if (at && hhmm(at) !== base) return { key, local: hhmm(at) };
  }
  return null;
}

function TimeInfo({ store }) {
  const r = store.routines.find((x) => x.active && x.fixed?.timeZone);
  const open = r && zonedTimeOnLocalDay(store.today, r.fixed.time, r.fixed.timeZone);
  const shift = r && nextShift(store.today, r.fixed.time, r.fixed.timeZone);
  return html`
    <section class="panel">
      <h2 class="label">Zeit</h2>
      <dl class="kv">
        <dt>Zeitzone (Gerät)</dt><dd>${deviceTimeZone()}</dd>
        <dt>Heute</dt><dd>${formatDate(store.today, { weekday: 'long', day: 'numeric', month: 'long' })}</dd>
        ${r && html`<dt>${r.title}: ${r.fixed.time} ${r.fixed.timeZone.split('/').pop().replace('_', ' ')}</dt><dd>${open ? `${hhmm(open)} Uhr` : '–'}</dd>`}
        ${shift && html`<dt>Ab ${formatDate(shift.key, { day: 'numeric', month: 'long', year: 'numeric' })}</dt><dd>${shift.local} Uhr</dd>`}
      </dl>
    </section>`;
}

// ---------- Speicher ----------

function StorageInfo({ store }) {
  const [estimate, setEstimate] = useState(null);
  const [persisted, setPersisted] = useState(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then(setEstimate);
    navigator.storage?.persisted?.().then(setPersisted);
  }, [store]);

  return html`
    <section class="panel">
      <h2 class="label">Speicher</h2>
      <dl class="kv">
        ${Object.entries(STORE_LABELS).map(([name, label]) => html`<dt key=${name}>${label}</dt><dd>${store[name].length}</dd>`)}
        ${estimate && html`<dt>Belegt</dt><dd>${formatBytes(estimate.usage)}</dd>`}
        ${persisted != null && html`<dt>Dauerhaft geschützt</dt><dd>${persisted ? 'ja' : 'nein'}</dd>`}
      </dl>
    </section>`;
}

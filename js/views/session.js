// Work-Sessions: Ziel wählen, laufende Uhr, Stoppen mit „Was hab ich gemacht?“, Nachtragen.

import { html, useEffect, useState } from '../vendor/preact-htm.js';
import {
  activeSession, deleteSession, newSession, parseNoteValues, pauseSession, resumeSession,
  saveSession, sessionDuration, sessionState, startSession, stopSession,
} from '../model.js';
import { dateAt, formatDuration, hhmm } from '../time.js';
import { Sheet, formatNumber } from '../ui.js';

const pad = (n) => String(n).padStart(2, '0');

export function formatClock(ms) {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
}

export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

// „Trading: 100 Backtests“ oder nur „Trading“.
export function targetLabel(store, { areaId, goalId }) {
  const goal = goalId && store.goals.find((g) => g.id === goalId);
  const area = store.areas.find((a) => a.id === (areaId || goal?.areaId));
  if (goal) return `${area ? `${area.name}: ` : ''}${goal.title}`;
  return area?.name || 'Ohne Bereich';
}

// Vorauswahl: Ziel der letzten Session.
export function lastTarget(store) {
  const last = store.sessions.reduce((a, s) => (!a || s.startAt > a.startAt ? s : a), null);
  if (last) return { areaId: last.areaId, goalId: last.goalId };
  const area = [...store.areas].sort((a, b) => a.order - b.order)[0];
  return { areaId: area?.id ?? null, goalId: null };
}

const sameTarget = (a, b) => a.areaId === b.areaId && (a.goalId || null) === (b.goalId || null);

// Auswahl als Liste: pro Bereich erst der Bereich selbst, dann seine Ziele.
export function TargetPicker({ store, value, onChange }) {
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  return html`
    <div class="picker">
      ${areas.map((area) => {
        const goals = store.goals.filter((g) => g.areaId === area.id && g.status === 'active').sort((a, b) => a.order - b.order);
        const opt = (t, label, cls = '') => html`
          <button type="button" class="pick ${cls} ${sameTarget(value, t) ? 'on' : ''}" aria-pressed=${sameTarget(value, t)}
            onClick=${() => onChange(t)}>${label}</button>`;
        return html`
          <div class="pick-group" key=${area.id}>
            ${opt({ areaId: area.id, goalId: null }, html`<span class="label">${area.name}</span>`, 'pick-area')}
            ${goals.map((g) => opt({ areaId: area.id, goalId: g.id }, g.title))}
          </div>`;
      })}
    </div>`;
}

export function StartSheet({ store, reload, notify, onClose }) {
  const [target, setTarget] = useState(() => lastTarget(store));
  const start = async () => {
    await startSession(target);
    await reload();
    notify(`Session gestartet: ${targetLabel(store, target)}`);
    onClose();
  };
  return html`
    <${Sheet} title="Session starten" onClose=${onClose}>
      <p class="muted small">Wofür arbeitest du? Ein Bereich gräbt im angepinnten Tunnel.</p>
      <${TargetPicker} store=${store} value=${target} onChange=${setTarget} />
      <div class="row sheet-actions"><button class="btn" onClick=${start}>Start</button></div>
    <//>`;
}

// Startet direkt aus einem Timetable-Block oder der Jetzt-Karte.
export async function startFromEntry(store, entry, { reload, notify }) {
  if (activeSession(store.sessions)) {
    notify('Es läuft schon eine Session.');
    return;
  }
  const target = { areaId: entry.areaId, goalId: entry.goalId, entryId: entry.id };
  await startSession(target);
  await reload();
  notify(`Session gestartet: ${targetLabel(store, target)}`);
}

// Laufende Session: Uhr, Pause/Weiter, Stopp.
export function SessionCard({ store, session, reload, onStop, compact = false }) {
  useTick(1000);
  const state = sessionState(session);
  const ms = sessionDuration(session);
  const long = store.settings.reminders?.session !== false && ms > store.settings.sessionLongHours * 3_600_000;
  const toggle = async () => {
    await (state === 'paused' ? resumeSession(session.id) : pauseSession(session.id));
    reload();
  };
  return html`
    <div class="session-card ${state} ${compact ? 'compact' : ''}">
      <div class="session-head">
        <div>
          <div class="label session-kicker">${state === 'paused' ? 'Pause' : 'Session läuft'}</div>
          <div class="session-target">${targetLabel(store, session)}</div>
        </div>
        <div class="session-clock num" aria-live="off">${formatClock(ms)}</div>
      </div>
      ${long && html`<p class="warn small">Läuft seit über ${store.settings.sessionLongHours} Stunden. Vergessen zu stoppen?</p>`}
      <div class="row">
        <button class="btn secondary" onClick=${toggle}>${state === 'paused' ? 'Weiter' : 'Pause'}</button>
        <button class="btn" onClick=${onStop}>Stopp</button>
      </div>
    </div>`;
}

export function StopSheet({ store, session, reload, notify, onClose }) {
  const [note, setNote] = useState('');
  const [skip, setSkip] = useState({});
  const found = parseNoteValues(note, session, store.goals);

  const stop = async () => {
    const values = found.filter((f) => !skip[f.goal.id]).map((f) => ({ goalId: f.goal.id, value: f.value }));
    const s = await stopSession(session.id, { note, values });
    await reload();
    const added = values.length ? ` · ${values.length === 1 ? 'Wert' : 'Werte'} eingetragen` : '';
    notify(`Session gespeichert: ${formatDuration(sessionDuration(s))}${added}`);
    onClose();
  };

  return html`
    <${Sheet} title="Session stoppen" onClose=${onClose}>
      <p class="muted small">${targetLabel(store, session)} · ${formatClock(sessionDuration(session))}</p>
      <label class="field">
        <span>Was hab ich gemacht? <span class="muted">(optional)</span></span>
        <textarea rows="3" value=${note} onInput=${(e) => setNote(e.target.value)}
          placeholder="z. B. 12 Backtests, Setup für London geprüft"></textarea>
      </label>
      ${found.length > 0 && html`
        <div class="found">
          ${found.map((f) => {
            const verb = f.goal.countMode === 'sum' ? 'addieren zu' : 'eintragen bei';
            return html`
              <label class="check-row" key=${f.goal.id}>
                <input type="checkbox" checked=${!skip[f.goal.id]}
                  onChange=${(e) => setSkip({ ...skip, [f.goal.id]: !e.target.checked })} />
                <span>${formatNumber(f.value)} ${verb} „${f.goal.title}“</span>
              </label>`;
          })}
        </div>`}
      <div class="row sheet-actions">
        <button class="btn" onClick=${stop}>Stoppen</button>
        <button class="btn secondary" onClick=${onClose}>Weiterlaufen lassen</button>
      </div>
    <//>`;
}


// Session nachtragen (session = null) oder bearbeiten.
export function EditSessionSheet({ store, session, date, start, end, reload, notify, onClose }) {
  const isNew = !session;
  const base = session || newSession({ ...lastTarget(store), startAt: dateAt(date, start || '09:00').getTime(), manual: true });
  const pausedMin = Math.round(base.pauses.reduce((s, p) => s + ((p.to ?? Date.now()) - p.from), 0) / 60000);
  const [target, setTarget] = useState({ areaId: base.areaId, goalId: base.goalId });
  const [form, setForm] = useState({
    date: base.date,
    start: hhmm(base.startAt),
    end: base.endAt ? hhmm(base.endAt) : isNew ? end || '10:00' : hhmm(Date.now()),
    pause: String(pausedMin),
    note: base.note || '',
  });
  const set = (key) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, [key]: v })); };
  const running = session && !session.endAt;

  const save = async () => {
    const startAt = dateAt(form.date, form.start).getTime();
    let endAt = dateAt(form.date, form.end).getTime();
    if (endAt <= startAt) endAt += 86_400_000; // über Mitternacht
    const pause = Math.max(0, parseInt(form.pause, 10) || 0) * 60000;
    if (pause >= endAt - startAt) return notify('Die Pause ist länger als die Session.', 'error');
    const keepPauses = !running && pause === pausedMin * 60000 && session?.startAt === startAt;
    await saveSession({
      ...base, ...target, startAt, endAt: running ? null : endAt, note: form.note.trim(),
      pauses: running || keepPauses ? base.pauses : pause ? [{ from: startAt, to: startAt + pause }] : [],
    });
    await reload();
    notify(isNew ? 'Session nachgetragen.' : 'Session gespeichert.');
    onClose();
  };

  const remove = async () => {
    if (!confirm('Diese Session löschen? Werte, die sie eingetragen hat, werden entfernt.')) return;
    await deleteSession(session.id);
    await reload();
    notify('Session gelöscht.');
    onClose();
  };

  return html`
    <${Sheet} title=${isNew ? 'Session nachtragen' : 'Session bearbeiten'} onClose=${onClose}>
      <${TargetPicker} store=${store} value=${target} onChange=${setTarget} />
      <div class="form-grid">
        <label class="field">Tag<input type="date" value=${form.date} onInput=${set('date')} /></label>
        <label class="field">Von<input type="time" value=${form.start} onInput=${set('start')} /></label>
        ${!running && html`<label class="field">Bis<input type="time" value=${form.end} onInput=${set('end')} /></label>`}
        <label class="field">Pausen (min)<input inputmode="numeric" value=${form.pause} onInput=${set('pause')} disabled=${running} /></label>
      </div>
      <label class="field">Notiz<textarea rows="2" value=${form.note} onInput=${set('note')}></textarea></label>
      <div class="row sheet-actions">
        <button class="btn" onClick=${save}>Speichern</button>
        ${!isNew && html`<button class="btn secondary danger" onClick=${remove}>Löschen</button>`}
      </div>
    <//>`;
}

// Datenmodell: Formen der Datensätze, abgeleitete Werte und die Grundoperationen.
//
// Bereich (areas)        → eine Gesteinsschicht
//   Ziel (goals)         → ein Tunnel; kind: 'number' | 'stages' | 'milestone'
//     Zwischenziel (milestones) → Fund im Gestein; bei Zahlenzielen mit targetValue
//     Notiz (goalNotes)
//     Wert-Eintrag (goalValues) → jede Änderung am Zahlenwert, mit Quelle
// Routine (routines)     → Vorlage, aus der jeden Tag ein Eintrag entsteht
// Tag (days)             → Ruhetag, Wasser, Planungs- und Rückblick-Zeitpunkt
// Eintrag (entries)      → Tagesplan: Routine-Instanz, Tagesziel oder Zeitblock
// Session (sessions)     → Stoppuhr mit Bereich/Ziel und Pausen
// Foto (photos)          → Tagesslot oder Zielfoto, verkleinert als Blob
// Idee (ideas)           → Eingangskorb

import * as db from './db.js';
import { addDays, dayKey, hhmm, parseDayKey, weekday, zonedTimeOnLocalDay, weekdayInZone } from './time.js';

export const PHOTO_SLOTS = [
  { key: 'selfie', label: 'Selfie' },
  { key: 'essen', label: 'Essen' },
  { key: 'sport', label: 'Sport' },
  { key: 'arbeit', label: 'Arbeiten', short: 'Arbeit' },
  { key: 'frei', label: 'Frei' },
];

export const GOAL_KINDS = { number: 'Zahlenziel', stages: 'Stufenziel', milestone: 'Meilenstein' };
export const COUNT_MODES = { sum: 'Summe', best: 'Bestwert', current: 'Stand' };
export const WINDOWS = { morning: 'morgens', midday: 'mittags', evening: 'abends', fixed: 'feste Zeit' };

export const DEFAULT_SETTINGS = {
  waterGoalMl: 4000,
  waterQuick: [300, 500],
  location: { name: 'Bangkok', lat: 13.7563, lon: 100.5018 },
  restDaysPerWeek: 2,
  exportReminderDays: 21,
  sessionLongHours: 3,
  reviewTime: '22:30',
  // Erinnerungen (nur in der App); fehlende Einträge gelten als eingeschaltet.
  reminders: {},
  planTime: '08:00',
  waterTime: '15:00',
  eveningTime: '20:00',
};

const now = () => Date.now();

// ---------- Fabriken ----------

export function newArea(p) {
  return { id: db.uid(), name: '', color: '#7a4a2a', layer: 'dirt', order: 0, pinnedGoalId: null, createdAt: now(), ...p };
}

export function newGoal(p) {
  return {
    id: db.uid(), areaId: null, title: '', kind: 'stages',
    countMode: null, unit: '', startValue: 0, target: null,
    order: 0, status: 'active', completedAt: null, createdAt: now(), ...p,
  };
}

export function newMilestone(p) {
  return { id: db.uid(), goalId: null, title: '', targetValue: null, order: 0, doneAt: null, createdAt: now(), ...p };
}

export function newRoutine(p) {
  return {
    id: db.uid(), title: '', minVersion: '', bonus: '',
    window: 'morning', fixed: null, // fixed: { time: '09:30', timeZone: 'America/New_York' }
    weekdays: null, // null = täglich; sonst Liste 0–6 (bei fixed: Wochentage in dessen Zeitzone)
    areaId: null, goalId: null, order: 0, active: true, createdAt: now(), ...p,
  };
}

export function newDay(date) {
  return { date, restDay: false, waterGoalMl: null, water: [], plannedAt: null, reviewedAt: null };
}

export function newEntry(p) {
  return {
    id: db.uid(), date: dayKey(), kind: 'task', // 'routine' | 'task' | 'block'
    title: '', routineId: null, areaId: null, goalId: null,
    amount: null, // Tagesziel mit Wert, z. B. 10 Backtests
    slot: null,   // Timetable: { start: 'HH:MM', end: 'HH:MM' }
    doneAt: null, bonusDoneAt: null, carriedFrom: null, order: 0, createdAt: now(), ...p,
  };
}

export function newSession(p) {
  const startAt = p?.startAt ?? now();
  return {
    id: db.uid(), areaId: null, goalId: null, startAt, endAt: null,
    pauses: [], // [{ from, to }] – to = null, solange pausiert
    note: '', manual: false, date: dayKey(startAt), createdAt: now(), ...p,
  };
}

export function newIdea(p) {
  return { id: db.uid(), text: '', areaId: null, status: 'open', convertedTo: null, createdAt: now(), ...p };
}

// ---------- Abgeleitete Werte ----------

// Aktueller Wert eines Zahlenziels aus seinen Wert-Einträgen.
export function goalValue(goal, values) {
  const own = values.filter((v) => v.goalId === goal.id).sort((a, b) => a.at - b.at);
  const start = goal.startValue || 0;
  switch (goal.countMode) {
    case 'sum': return own.reduce((s, v) => s + v.value, start);
    case 'best': return own.reduce((m, v) => Math.max(m, v.value), start);
    case 'current': return own.length ? own[own.length - 1].value : start;
    default: return start;
  }
}

// Netto-Dauer einer Session in ms, Pausen abgezogen. Laufende Sessions zählen bis jetzt.
export function sessionDuration(s, at = now()) {
  const end = s.endAt ?? at;
  const paused = s.pauses.reduce((sum, p) => sum + ((p.to ?? end) - p.from), 0);
  return Math.max(0, end - s.startAt - paused);
}

export const sessionState = (s) =>
  s.endAt ? 'done' : s.pauses.some((p) => p.to == null) ? 'paused' : 'running';

// Ob eine Routine an einem lokalen Tag fällig ist, und wann (bei fester Zeit).
export function routineOnDay(routine, key) {
  if (!routine.active) return null;
  if (routine.fixed) {
    const at = zonedTimeOnLocalDay(key, routine.fixed.time, routine.fixed.timeZone);
    if (!at) return null;
    if (routine.weekdays && !routine.weekdays.includes(weekdayInZone(at, routine.fixed.timeZone))) return null;
    return { at };
  }
  if (routine.weekdays && !routine.weekdays.includes(weekday(key))) return null;
  return { at: null };
}

// ---------- Operationen ----------

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await db.getMeta('settings', {})) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  await db.setMeta('settings', { ...current, ...patch });
}

// Legt den Tag an und erzeugt die Routine-Einträge, falls noch nicht geschehen.
// Vergangene Tage werden nicht nachträglich befüllt.
export async function ensureDay(key = dayKey()) {
  const [routines, entries] = await Promise.all([db.getAll('routines'), db.getAllBy('entries', 'date', key)]);
  const day = (await db.get('days', key)) || newDay(key);
  const have = new Set(entries.filter((e) => e.routineId).map((e) => e.routineId));
  const fresh = [];
  for (const r of routines.sort((a, b) => a.order - b.order)) {
    if (have.has(r.id)) continue;
    const due = routineOnDay(r, key);
    if (!due) continue;
    fresh.push(newEntry({
      date: key, kind: 'routine', title: r.title, routineId: r.id,
      areaId: r.areaId, goalId: r.goalId, order: r.order,
      slot: due.at ? { start: hhmm(due.at), end: null } : null,
    }));
  }
  await db.tx(['days', 'entries'], 'readwrite', (s) => {
    s.days.put(day);
    for (const e of fresh) s.entries.put(e);
  });
  return day;
}

// Trägt einen Wert bei einem Zahlenziel ein. Bei 'sum' ist value der Zuwachs,
// bei 'best' und 'current' der neue Stand. Erreichte Zwischenziele werden
// mit Datum markiert und bleiben erreicht, auch wenn ein Stand später sinkt.
export async function addGoalValue(goalId, value, source = { type: 'manual' }) {
  const goal = await db.get('goals', goalId);
  if (!goal || goal.kind !== 'number') throw new Error('Kein Zahlenziel');
  const entry = { id: db.uid(), goalId, value: Number(value), date: dayKey(), at: now(), source };
  const values = [...(await db.getAllBy('goalValues', 'goalId', goalId)), entry];
  const total = goalValue(goal, values);
  const milestones = await db.getAllBy('milestones', 'goalId', goalId);
  const reached = milestones.filter((m) => !m.doneAt && m.targetValue != null && total >= m.targetValue);
  const completes = goal.status === 'active' && goal.target != null && total >= goal.target;
  await db.tx(['goalValues', 'milestones', 'goals'], 'readwrite', (s) => {
    s.goalValues.put(entry);
    for (const m of reached) s.milestones.put({ ...m, doneAt: entry.at });
    if (completes) s.goals.put({ ...goal, status: 'done', completedAt: entry.at });
  });
  return { total, reached, completes };
}

// ---------- Tag: Wasser, Erfüllung, Streak ----------

export const waterTotal = (day) => (day?.water || []).reduce((s, w) => s + w.ml, 0);
export const waterGoal = (day, settings) => day?.waterGoalMl ?? settings.waterGoalMl;

async function updateDay(key, fn) {
  return db.tx('days', 'readwrite', async (s) => {
    const day = (await new Promise((res, rej) => {
      const r = s.days.get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    })) || newDay(key);
    const result = fn(day);
    s.days.put(day);
    return result;
  });
}

export const addWater = (key, ml) => updateDay(key, (day) => { day.water.push({ ml, at: now() }); });
export const undoWater = (key) => updateDay(key, (day) => day.water.pop() || null);
export const setWaterGoal = (key, ml) => updateDay(key, (day) => { day.waterGoalMl = ml; });

// Hakt einen Eintrag ab oder zurück. Ein Tagesziel mit Ziel und Menge trägt dabei
// den Wert beim Ziel ein (bzw. nimmt ihn wieder heraus).
export async function setEntryDone(id, done, { bonus = false } = {}) {
  const entry = await db.get('entries', id);
  if (!entry) return null;
  if (bonus) entry.bonusDoneAt = done ? now() : null;
  else entry.doneAt = done ? now() : null;
  // Bonus geht nur mit erledigter Mindestversion.
  if (bonus && done && !entry.doneAt) entry.doneAt = now();
  if (!bonus && !done) entry.bonusDoneAt = null;
  await db.put('entries', entry);
  if (entry.kind === 'routine' && done && !bonus) await checkAutoMilestones(entry.date);

  if (bonus || entry.kind !== 'task' || !entry.goalId || entry.amount == null) return null;
  const goal = await db.get('goals', entry.goalId);
  if (goal?.kind !== 'number') return null;
  const source = { type: 'entry', id: entry.id };
  if (done) return addGoalValue(goal.id, entry.amount, source);
  await removeGoalValues(source);
  return null;
}

// Entfernt Wert-Einträge einer Quelle (oder { valueId } für einen einzelnen). Funde, die
// genau dieser Eintrag freigelegt hat, werden wieder verdeckt; alles andere bleibt erreicht.
export async function removeGoalValues(source) {
  const match = source.valueId
    ? (v) => v.id === source.valueId
    : (v) => v.source?.type === source.type && v.source?.id === source.id;
  const values = (await db.getAll('goalValues')).filter(match);
  if (!values.length) return;
  const stamps = new Set(values.map((v) => v.at));
  const goalIds = new Set(values.map((v) => v.goalId));
  const milestones = (await db.getAll('milestones')).filter((m) => goalIds.has(m.goalId) && stamps.has(m.doneAt));
  const goals = (await db.getAll('goals')).filter((g) => goalIds.has(g.id) && stamps.has(g.completedAt));
  await db.tx(['goalValues', 'milestones', 'goals'], 'readwrite', (st) => {
    values.forEach((v) => st.goalValues.delete(v.id));
    milestones.forEach((m) => st.milestones.put({ ...m, doneAt: null }));
    goals.forEach((g) => st.goals.put({ ...g, status: 'active', completedAt: null }));
  });
}

// ---------- Tagesplan ----------

export async function addTask(date, { title, goalId = null, amount = null, areaId = null }) {
  const entries = await db.getAllBy('entries', 'date', date);
  const entry = newEntry({ date, kind: 'task', title, goalId, amount, areaId, order: entries.length + 100 });
  await db.put('entries', entry);
  return entry;
}

export async function addBlock(date, { title, areaId = null, goalId = null, start, end }) {
  const entry = newEntry({ date, kind: 'block', title, areaId, goalId, slot: { start, end } });
  await db.put('entries', entry);
  return entry;
}

export async function updateEntry(id, patch) {
  const entry = await db.get('entries', id);
  if (!entry) return null;
  const next = { ...entry, ...patch };
  await db.put('entries', next);
  return next;
}

export async function deleteEntry(id) {
  await removeGoalValues({ type: 'entry', id });
  await db.del('entries', id);
}

export async function setPlanned(date, done = true) {
  await updateDay(date, (day) => { day.plannedAt = done ? now() : null; });
}

// Abendrückblick: ausgewählte offene Tagesziele auf morgen kopieren.
export async function carryOver(date, ids) {
  const tomorrow = addDays(date, 1);
  const entries = (await db.getAllBy('entries', 'date', date)).filter((e) => ids.includes(e.id));
  await db.tx(['entries'], 'readwrite', (st) => {
    entries.forEach((e, i) => {
      st.entries.put({ ...e, movedTo: tomorrow });
      st.entries.put(newEntry({
        date: tomorrow, kind: e.kind, title: e.title, areaId: e.areaId, goalId: e.goalId,
        amount: e.amount, carriedFrom: date, order: 100 + i,
      }));
    });
  });
  await updateDay(date, (day) => { day.reviewedAt = now(); });
}

export const markReviewed = (date) => updateDay(date, (day) => { day.reviewedAt = now(); });

// ---------- Work-Sessions ----------

export const activeSession = (sessions) => sessions.find((s) => !s.endAt) || null;

export async function startSession({ areaId, goalId = null, entryId = null }) {
  const running = activeSession(await db.getAll('sessions'));
  if (running) return running;
  const goal = goalId ? await db.get('goals', goalId) : null;
  const session = newSession({ areaId: areaId ?? goal?.areaId ?? null, goalId, entryId });
  await db.put('sessions', session);
  return session;
}

export async function pauseSession(id) {
  const s = await db.get('sessions', id);
  if (!s || s.endAt || sessionState(s) === 'paused') return s;
  s.pauses.push({ from: now(), to: null });
  await db.put('sessions', s);
  return s;
}

export async function resumeSession(id) {
  const s = await db.get('sessions', id);
  const open = s?.pauses.find((p) => p.to == null);
  if (!open) return s;
  open.to = now();
  await db.put('sessions', s);
  return s;
}

// Stoppt die Session; values: [{ goalId, value }] aus „Was hab ich gemacht?“.
export async function stopSession(id, { note = '', values = [] } = {}) {
  const s = await db.get('sessions', id);
  if (!s || s.endAt) return s;
  const end = now();
  s.pauses.forEach((p) => { if (p.to == null) p.to = end; });
  s.endAt = end;
  s.note = note.trim();
  await db.put('sessions', s);
  for (const v of values) await addGoalValue(v.goalId, v.value, { type: 'session', id: s.id });
  return s;
}

export async function saveSession(session) {
  const s = { ...session, date: dayKey(session.startAt) };
  await db.put('sessions', s);
  return s;
}

export async function deleteSession(id) {
  await removeGoalValues({ type: 'session', id });
  await db.del('sessions', id);
}

// Erkennt „12 Backtests“, „4 min Plank“ oder eine bloße Zahl (→ Ziel der Session).
// Nur Zahlenziele kommen infrage.
export function parseNoteValues(note, session, goals) {
  const numberGoals = goals.filter((g) => g.kind === 'number' && g.status === 'active');
  const words = (g) => `${g.unit} ${g.title}`.toLowerCase().split(/[^a-zäöüß€0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w));
  const found = new Map();
  const re = /(\d+(?:[.,]\d+)?)\s*([a-zäöüß€]+)?(?:\s+([a-zäöüß€]+))?/gi;
  for (const m of note.matchAll(re)) {
    const value = parseFloat(m[1].replace(',', '.'));
    const tokens = [m[2], m[3]].filter(Boolean).map((t) => t.toLowerCase());
    let goal = null;
    if (tokens.length) {
      goal = numberGoals.find((g) => tokens.some((t) => words(g).some((w) => w.startsWith(t.slice(0, 5)) || t.startsWith(w.slice(0, 5)))));
    }
    if (!goal && session.goalId) goal = numberGoals.find((g) => g.id === session.goalId) || null;
    if (goal && !found.has(goal.id)) found.set(goal.id, { goal, value });
  }
  return [...found.values()];
}

// Ziel, auf das eine Session gräbt: ihr Ziel oder das angepinnte ihres Bereichs.
export function sessionGoalId(session, areas) {
  return session.goalId || areas.find((a) => a.id === session.areaId)?.pinnedGoalId || null;
}

// Stunden pro Bereich zwischen zwei Tagen (einschließlich).
export function hoursByArea(store, from, to) {
  const out = {};
  for (const s of store.sessions) {
    if (s.date < from || s.date > to) continue;
    const key = s.areaId || 'ohne';
    out[key] = (out[key] || 0) + sessionDuration(s) / 3_600_000;
  }
  return out;
}

// Montag der Woche von key.
export function weekStart(key) {
  const wd = (weekday(key) + 6) % 7;
  return addDays(key, -wd);
}

// Ein Tag ist erfüllt, wenn alle Routinen (Mindestversion) und Tagesziele erledigt sind,
// das Wasserziel erreicht ist und mindestens ein Foto drin ist.
export function dayStatus(store, key) {
  const day = store.days.find((d) => d.date === key);
  const entries = store.entries.filter((e) => e.date === key && e.kind !== 'block');
  const routines = entries.filter((e) => e.kind === 'routine');
  const tasks = entries.filter((e) => e.kind === 'task');
  const photos = store.photos.filter((p) => p.date === key && p.slot).length;
  const water = waterTotal(day);
  const goal = waterGoal(day, store.settings);
  const parts = {
    routines: [routines.filter((e) => e.doneAt).length, routines.length],
    tasks: [tasks.filter((e) => e.doneAt).length, tasks.length],
    water: [water, goal],
    photos: [photos, PHOTO_SLOTS.length],
  };
  const fulfilled = Boolean(day)
    && parts.routines[0] === parts.routines[1]
    && parts.tasks[0] === parts.tasks[1]
    && water >= goal
    && photos >= 1;
  return { fulfilled, restDay: Boolean(day?.restDay), parts };
}

// Tage am Stück mit erfülltem Plan; Ruhetage zählen mit. Der heutige Tag zählt,
// sobald er erfüllt ist, und bricht den Streak bis Mitternacht nicht.
export function streak(store, today) {
  const kept = (key) => { const s = dayStatus(store, key); return s.fulfilled || s.restDay; };
  const todayKept = kept(today);
  let count = todayKept ? 1 : 0;
  const first = store.days.reduce((min, d) => (d.date < min ? d.date : min), today);
  for (let key = addDays(today, -1); key >= first; key = addDays(key, -1)) {
    if (!kept(key)) break;
    count++;
  }
  return { count, todayKept };
}

// ---------- Tunnel ----------

// Session-Stunden graben den Tunnel bis kurz vor den nächsten Fund weiter.
const DIG_PER_HOUR = 0.08;
const DIG_MAX = 0.85;

// Fortschritt eines Ziels als Tunnellänge 0–1 und Lage der Funde.
export function tunnelProgress(goal, store) {
  const steps = store.milestones.filter((m) => m.goalId === goal.id).sort((a, b) => a.order - b.order);
  const total = Math.max(1, steps.length);
  const done = goal.status === 'done' ? total : steps.filter((m) => m.doneAt).length;
  const value = goal.kind === 'number' ? goalValue(goal, store.goalValues) : null;

  let partial = 0;
  if (done < total) {
    const lastFound = Math.max(goal.createdAt, ...steps.map((m) => m.doneAt || 0));
    const hours = store.sessions
      .filter((s) => sessionGoalId(s, store.areas) === goal.id && s.startAt >= lastFound)
      .reduce((h, s) => h + sessionDuration(s) / 3_600_000, 0);
    partial = Math.min(DIG_MAX, hours * DIG_PER_HOUR);
    const next = steps[done];
    const auto = next && autoProgress(next, store, store.today || dayKey());
    if (auto) partial = Math.max(partial, Math.min(DIG_MAX, auto.value / auto.target));
    if (goal.kind === 'number' && next?.targetValue != null) {
      const prev = done > 0 ? steps[done - 1].targetValue ?? goal.startValue : goal.startValue;
      const span = next.targetValue - prev;
      if (span > 0) partial = Math.max(partial, Math.min(DIG_MAX, (value - prev) / span));
    }
  }
  return {
    dug: Math.min(1, (done + Math.max(0, partial)) / total),
    finds: steps.map((m, i) => ({ milestone: m, at: (i + 1) / total, reached: Boolean(m.doneAt) || goal.status === 'done' })),
    done,
    total: steps.length,
    value,
  };
}

// ---------- Ziele, Zwischenziele, Notizen ----------

// Tage am Stück, an denen eine Routine erledigt war. Heute zählt mit, sobald erledigt;
// Tage, an denen die Routine nicht fällig war, unterbrechen nicht.
export function routineStreak(store, routineId, today) {
  const routine = store.routines.find((r) => r.id === routineId);
  if (!routine) return 0;
  const doneOn = new Set(store.entries.filter((e) => e.routineId === routineId && e.doneAt).map((e) => e.date));
  const first = store.entries.reduce((min, e) => (e.routineId === routineId && e.date < min ? e.date : min), today);
  let count = doneOn.has(today) ? 1 : 0;
  for (let key = addDays(today, -1); key >= first; key = addDays(key, -1)) {
    if (doneOn.has(key)) count++;
    else if (routineOnDay(routine, key)) break;
  }
  return count;
}

// Fortschritt eines automatischen Zwischenziels (z. B. 30 Tage Routine am Stück).
export function autoProgress(milestone, store, today) {
  if (milestone.auto?.type !== 'routineStreak') return null;
  return { value: routineStreak(store, milestone.auto.routineId, today), target: milestone.auto.days };
}

// Prüft automatische Zwischenziele und hakt sie ab, sobald sie erreicht sind.
export async function checkAutoMilestones(today = dayKey()) {
  const store = await db.dumpAll();
  const due = store.milestones.filter((m) => !m.doneAt && m.auto);
  const reached = due.filter((m) => { const p = autoProgress(m, store, today); return p && p.value >= p.target; });
  for (const m of reached) await setMilestoneDone(m.id, true);
  return reached;
}

async function goalBundle(goalId) {
  const [goal, milestones] = await Promise.all([db.get('goals', goalId), db.getAllBy('milestones', 'goalId', goalId)]);
  return { goal, milestones: milestones.sort((a, b) => a.order - b.order) };
}

// Hakt ein Zwischenziel ab. Sind danach alle erledigt, ist das Ziel geschafft (Schatz frei);
// wird eines zurückgenommen, ist das Ziel wieder offen.
export async function setMilestoneDone(id, done) {
  const m = await db.get('milestones', id);
  if (!m) return null;
  const at = now();
  const { goal, milestones } = await goalBundle(m.goalId);
  const next = milestones.map((x) => (x.id === id ? { ...x, doneAt: done ? at : null } : x));
  const allDone = next.length > 0 && next.every((x) => x.doneAt);
  const goalPatch = allDone && goal.status !== 'done' ? { status: 'done', completedAt: at }
    : !allDone && goal.status === 'done' ? { status: 'active', completedAt: null } : null;
  await db.tx(['milestones', 'goals'], 'readwrite', (s) => {
    s.milestones.put({ ...m, doneAt: done ? at : null });
    if (goalPatch) s.goals.put({ ...goal, ...goalPatch });
  });
  return { completed: goalPatch?.status === 'done' };
}

export async function addMilestone(goalId, { title, targetValue = null }) {
  const { goal, milestones } = await goalBundle(goalId);
  const m = newMilestone({ goalId, title, targetValue, order: milestones.length });
  if (goal.kind === 'number' && targetValue != null) {
    const values = await db.getAllBy('goalValues', 'goalId', goalId);
    if (goalValue(goal, values) >= targetValue) m.doneAt = now();
  }
  // Bei Stufenzielen bleibt der letzte Fund der Schatz: Neues kommt davor.
  const last = milestones.at(-1);
  if (goal.kind === 'stages' && last && !last.doneAt) {
    m.order = last.order;
    await db.put('milestones', { ...last, order: last.order + 1 });
  }
  await db.put('milestones', m);
  // Zahlenziele: Reihenfolge folgt den Zielwerten.
  if (goal.kind === 'number') await sortByValue(goalId);
  return m;
}

async function sortByValue(goalId) {
  const { milestones } = await goalBundle(goalId);
  const sorted = [...milestones].sort((a, b) => (a.targetValue ?? Infinity) - (b.targetValue ?? Infinity) || a.order - b.order);
  await db.tx('milestones', 'readwrite', (s) => sorted.forEach((m, i) => s.milestones.put({ ...m, order: i })));
}

export async function updateMilestone(id, patch) {
  const m = await db.get('milestones', id);
  if (!m) return;
  await db.put('milestones', { ...m, ...patch });
  const goal = await db.get('goals', m.goalId);
  if (goal.kind === 'number' && 'targetValue' in patch) await sortByValue(m.goalId);
}

export const deleteMilestone = (id) => db.del('milestones', id);

export async function reorderMilestones(ids) {
  await db.tx('milestones', 'readwrite', async (s) => {
    for (const [i, id] of ids.entries()) {
      const m = await new Promise((res) => { const r = s.milestones.get(id); r.onsuccess = () => res(r.result); });
      if (m) s.milestones.put({ ...m, order: i });
    }
  });
}

export async function addNote(goalId, text) {
  const note = { id: db.uid(), goalId, text: text.trim(), createdAt: now() };
  await db.put('goalNotes', note);
  return note;
}
export const deleteNote = (id) => db.del('goalNotes', id);

export async function createGoal(p) {
  const goals = await db.getAllBy('goals', 'areaId', p.areaId);
  const goal = newGoal({ ...p, order: goals.length });
  await db.put('goals', goal);
  // Ein Meilenstein ist ein einziger Fund: das Ziel selbst.
  if (goal.kind === 'milestone') await db.put('milestones', newMilestone({ goalId: goal.id, title: goal.title }));
  // Erstes Ziel eines Bereichs wird automatisch angepinnt.
  const area = await db.get('areas', p.areaId);
  if (area && !area.pinnedGoalId) await db.put('areas', { ...area, pinnedGoalId: goal.id });
  return goal;
}

export async function updateGoal(id, patch) {
  const goal = await db.get('goals', id);
  await db.put('goals', { ...goal, ...patch });
}

export async function pinGoal(goal) {
  const area = await db.get('areas', goal.areaId);
  await db.put('areas', { ...area, pinnedGoalId: goal.id });
}

// Archivieren: verschwindet aus der Welt, Daten und Stunden bleiben.
export async function archiveGoal(goal, archived = true) {
  await updateGoal(goal.id, { status: archived ? 'archived' : 'active' });
  const area = await db.get('areas', goal.areaId);
  if (archived && area.pinnedGoalId === goal.id) {
    const rest = (await db.getAllBy('goals', 'areaId', goal.areaId)).filter((g) => g.id !== goal.id && g.status !== 'archived');
    await db.put('areas', { ...area, pinnedGoalId: rest.sort((a, b) => a.order - b.order)[0]?.id ?? null });
  }
}

// Löschen entfernt Ziel, Zwischenziele, Notizen und Werte. Sessions bleiben als Bereichs-Stunden.
export async function deleteGoal(goal) {
  await archiveGoal(goal, true);
  const stores = ['goals', 'milestones', 'goalNotes', 'goalValues', 'sessions', 'entries', 'routines'];
  await db.tx(stores, 'readwrite', async (s) => {
    const all = async (name) => new Promise((res) => { const r = s[name].getAll(); r.onsuccess = () => res(r.result); });
    for (const m of await all('milestones')) if (m.goalId === goal.id) s.milestones.delete(m.id);
    for (const n of await all('goalNotes')) if (n.goalId === goal.id) s.goalNotes.delete(n.id);
    for (const v of await all('goalValues')) if (v.goalId === goal.id) s.goalValues.delete(v.id);
    for (const x of await all('sessions')) if (x.goalId === goal.id) s.sessions.put({ ...x, goalId: null });
    for (const x of await all('entries')) if (x.goalId === goal.id) s.entries.put({ ...x, goalId: null });
    for (const x of await all('routines')) if (x.goalId === goal.id) s.routines.put({ ...x, goalId: null });
    s.goals.delete(goal.id);
  });
}

// Investierte Zeit: alle Sessions, die auf dieses Ziel graben.
export function goalTime(goal, store, today) {
  const sessions = store.sessions.filter((s) => sessionGoalId(s, store.areas) === goal.id);
  const total = sessions.reduce((h, s) => h + sessionDuration(s), 0) / 3_600_000;
  const last = sessions.reduce((max, s) => (s.date > max ? s.date : max), '');
  const first = sessions.reduce((min, s) => (s.date < min ? s.date : min), today);
  const daysSince = (a, b) => Math.round((parseDayKey(b) - parseDayKey(a)) / 86_400_000);
  const weeks = [];
  for (let w = weekStart(first); w <= today; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    const h = sessions.filter((s) => s.date >= w && s.date <= end).reduce((x, s) => x + sessionDuration(s), 0) / 3_600_000;
    weeks.push({ start: w, hours: h });
  }
  return {
    total, count: sessions.length,
    lastDaysAgo: last ? daysSince(last, today) : null,
    dataDays: sessions.length ? daysSince(first, today) : 0,
    weeks,
  };
}

// ---------- Kalender ----------

// Aktivität eines Tages: erledigte Einträge plus Session-Stunden, in Stufen 0–4.
const ACTIVITY_STEPS = [0, 3, 6, 9];
export function dayActivity(store, key) {
  const done = store.entries.filter((e) => e.date === key && e.kind !== 'block' && e.doneAt).length;
  const hours = store.sessions.filter((s) => s.date === key).reduce((h, s) => h + sessionDuration(s), 0) / 3_600_000;
  const photos = store.photos.filter((p) => p.date === key && p.slot).length;
  const water = waterTotal(store.days.find((d) => d.date === key));
  const score = done + hours;
  const any = score > 0 || photos > 0 || water > 0;
  const level = !any ? 0 : ACTIVITY_STEPS.filter((t) => score > t).length || 1;
  return { level, done, hours, photos, water };
}

// Ziele, die sich an einem Tag bewegt haben: Zahlenwerte vorher/nachher und freigelegte Funde.
export function goalMoves(store, key) {
  const moves = [];
  for (const goal of store.goals) {
    const values = store.goalValues.filter((v) => v.goalId === goal.id);
    if (goal.kind === 'number' && values.some((v) => v.date === key)) {
      const before = goalValue(goal, values.filter((v) => v.date < key));
      const after = goalValue(goal, values.filter((v) => v.date <= key));
      if (before !== after) moves.push({ goal, type: 'value', before, after });
    }
    for (const m of store.milestones) {
      if (m.goalId === goal.id && m.doneAt && dayKey(m.doneAt) === key) moves.push({ goal, type: 'find', milestone: m });
    }
    if (goal.completedAt && dayKey(goal.completedAt) === key) moves.push({ goal, type: 'done' });
  }
  return moves;
}

// ---------- Ideen ----------

export async function addIdea(text, areaId = null) {
  const idea = newIdea({ text: text.trim(), areaId });
  await db.put('ideas', idea);
  return idea;
}

export async function updateIdea(id, patch) {
  const idea = await db.get('ideas', id);
  if (idea) await db.put('ideas', { ...idea, ...patch, updatedAt: now() });
}

export const deleteIdea = (id) => db.del('ideas', id);

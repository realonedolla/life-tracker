// Erinnerungen, nur in der App: Was jetzt fällig ist, wird aus den Daten berechnet.
// Sparsam: höchstens zwei gleichzeitig, jede lässt sich für heute wegklicken oder ganz abschalten.

import { activeSession, dayStatus, sessionDuration, waterGoal, waterTotal } from './model.js';
import { appMinutes, slotMinutes as toMin } from './time.js';

export const REMINDERS = [
  { id: 'session', label: 'Session läuft lange', time: null, hint: 'nach der eingestellten Dauer' },
  { id: 'block', label: 'Nächster Block', time: null, hint: '5 Minuten vor einem Block mit Bereich' },
  { id: 'plan', label: 'Tag planen', time: 'planTime', hint: 'wenn der Plan noch leer ist' },
  { id: 'water', label: 'Wasser', time: 'waterTime', hint: 'wenn noch nicht die Hälfte drin ist' },
  { id: 'evening', label: 'Fotos und Routinen', time: 'eveningTime', hint: 'wenn noch kein Foto da ist oder Routinen offen sind' },
  { id: 'review', label: 'Abendrückblick', time: 'reviewTime', hint: 'bis er abgeschlossen ist' },
  { id: 'backup', label: 'Sicherung', time: null, hint: 'wenn die letzte länger als 3 Wochen her ist' },
];

const liters = (ml) => (ml / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const MAX_SHOWN = 2;

// Weggeklickte Erinnerungen gelten nur für heute und nur auf diesem Gerät.
const DISMISS_KEY = 'lt-dismissed';
export function dismissedToday(today) {
  try {
    const d = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
    return d.date === today ? new Set(d.ids) : new Set();
  } catch {
    return new Set();
  }
}
export function dismiss(today, id) {
  try {
    const ids = [...dismissedToday(today), id];
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ date: today, ids }));
  } catch {}
}

// Alle gerade fälligen Erinnerungen, wichtigste zuerst.
export function dueReminders(store, now = new Date()) {
  const s = store.settings;
  const on = (id) => s.reminders?.[id] !== false;
  const mins = appMinutes(now);
  const today = store.today;
  const day = store.days.find((d) => d.date === today);
  const status = dayStatus(store, today);
  const out = [];

  const running = activeSession(store.sessions);
  if (on('session') && running && sessionDuration(running) > s.sessionLongHours * 3_600_000) {
    out.push({ id: 'session', text: `Deine Session läuft seit über ${s.sessionLongHours} Stunden. Vergessen zu stoppen?`, href: '#/heute' });
  }

  if (on('block') && !running) {
    const soon = store.entries
      .filter((e) => e.date === today && e.areaId && e.slot?.start && !e.doneAt && !e.movedTo)
      .map((e) => ({ e, start: toMin(e.slot.start) }))
      .filter((b) => b.start - mins >= 0 && b.start - mins <= 5)
      .sort((a, b) => a.start - b.start)[0];
    if (soon) out.push({ id: `block-${soon.e.id}`, kind: 'block', text: `Gleich, ${soon.e.slot.start} Uhr: ${soon.e.title}.`, href: '#/welt' });
  }

  if (on('review') && mins >= toMin(s.reviewTime) && !day?.reviewedAt) {
    out.push({ id: 'review', text: 'Zeit für den Abendrückblick.', href: '#/heute' });
  }

  if (on('evening') && mins >= toMin(s.eveningTime) && mins < toMin(s.reviewTime)) {
    const noPhoto = status.parts.photos[0] === 0;
    const [done, total] = status.parts.routines;
    if (noPhoto || done < total) {
      const bits = [noPhoto && 'noch kein Foto', done < total && `${total - done} ${total - done === 1 ? 'Routine' : 'Routinen'} offen`].filter(Boolean);
      out.push({ id: 'evening', text: `Heute ${bits.join(' und ')}.`, href: '#/welt' });
    }
  }

  if (on('water') && mins >= toMin(s.waterTime) && mins < toMin(s.reviewTime)) {
    const total = waterTotal(day);
    const goal = waterGoal(day, s);
    if (total < goal / 2) out.push({ id: 'water', text: `Erst ${liters(total)} von ${liters(goal)} l getrunken.`, href: '#/welt' });
  }

  // „Plan noch leer“: nicht als geplant markiert und weder Tagesziel noch selbst gesetzter Block.
  const planned = day?.plannedAt || store.entries.some((e) => e.date === today && (e.kind !== 'routine' || (e.slot?.start && !store.routines.find((r) => r.id === e.routineId)?.fixed)));
  if (on('plan') && mins >= toMin(s.planTime) && mins < toMin(s.reviewTime) && !planned) {
    out.push({ id: 'plan', text: 'Dein Tag ist noch nicht geplant.', href: '#/heute' });
  }

  if (on('backup')) {
    const days = store.lastExportAt ? Math.floor((Date.now() - store.lastExportAt) / 86_400_000) : null;
    // Ohne je eine Sicherung erst ab dem dritten Tag Nutzung erinnern.
    const usedDays = store.days.length;
    if ((days == null && usedDays >= 3) || days > s.exportReminderDays) {
      out.push({ id: 'backup', text: days == null ? 'Noch keine Sicherung deiner Daten.' : `Letzte Sicherung vor ${days} Tagen.`, href: '#/daten' });
    }
  }

  const dismissed = dismissedToday(today);
  return out.filter((r) => !dismissed.has(r.id));
}

export const shownReminders = (store, now, hidden = []) =>
  dueReminders(store, now).filter((r) => !hidden.includes(r.id)).slice(0, MAX_SHOWN);

// Zeit-Helfer. Die App rechnet in Gerätezeit. Ein App-Tag beginnt um 3 Uhr morgens:
// Alles zwischen 0:00 und 2:59 zählt noch zum Vortag (Trading-Session nach Mitternacht usw.).

export const DAY_START_H = 3;

const pad = (n) => String(n).padStart(2, '0');

// Kalenderdatum 'YYYY-MM-DD' ohne Verschiebung.
function calendarKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// App-Tag 'YYYY-MM-DD', zu dem ein Zeitpunkt gehört.
export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return calendarKey(new Date(d.getTime() - DAY_START_H * 3_600_000));
}

// Minuten seit 0:00 des App-Tags: 1:30 nach Mitternacht ergibt 25:30 = 1530.
export function appMinutes(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const h = d.getHours();
  return (h < DAY_START_H ? h + 24 : h) * 60 + d.getMinutes();
}

// 'HH:MM' eines Plans als App-Minuten; Zeiten vor 3 Uhr liegen nach Mitternacht.
export function slotMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return (h < DAY_START_H ? h + 24 : h) * 60 + m;
}

export const formatMinutes = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

// Zeitpunkt der Uhrzeit 'HH:MM' am App-Tag key (vor 3 Uhr: am Kalender-Folgetag).
export function dateAt(key, time) {
  const [h, m] = time.split(':').map(Number);
  const d = parseDayKey(key);
  if (h < DAY_START_H) d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d;
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return calendarKey(d);
}

// 0 = Sonntag … 6 = Samstag
export const weekday = (key) => parseDayKey(key).getDay();

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function hhmm(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Versatz einer Zeitzone zu UTC in Millisekunden zum Zeitpunkt ms.
function zoneOffset(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Zeitpunkt, an dem in timeZone am Datum key die Uhr 'HH:MM' zeigt.
// Zweimal angleichen, damit Sommerzeitwechsel korrekt landen.
export function zonedToDate(key, time, timeZone) {
  const [y, m, d] = key.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let ms = wall - zoneOffset(wall, timeZone);
  ms = wall - zoneOffset(ms, timeZone);
  return new Date(ms);
}

// Feste Uhrzeit einer anderen Zone (z. B. NY-Open 09:30 New York),
// die auf den lokalen Tag key fällt. null, wenn sie an dem Tag nicht vorkommt.
export function zonedTimeOnLocalDay(key, time, timeZone) {
  for (const offset of [0, -1, 1]) {
    const at = zonedToDate(addDays(key, offset), time, timeZone);
    if (dayKey(at) === key) return at;
  }
  return null;
}

// Wochentag (0–6), den ein Zeitpunkt in einer anderen Zeitzone hat.
export function weekdayInZone(date, timeZone) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

export function formatDuration(ms) {
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h} h ${pad(min % 60)} min` : `${min} min`;
}

export function formatDate(key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseDayKey(key).toLocaleDateString('de-DE', opts);
}

// Zeit-Helfer. Die App rechnet in Gerätezeit, ein Tag beginnt um Mitternacht.

const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' in Gerätezeit.
export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
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

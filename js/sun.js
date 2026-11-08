// Sonnenzeiten und Himmelsfarben. Formeln nach SunCalc (Vladimir Agafonkin, BSD).

const rad = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const obliquity = rad * 23.4397;

const toJulian = (date) => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date) => toJulian(date) - J2000;
const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
const declination = (l) => Math.asin(Math.sin(obliquity) * Math.sin(l));
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

// Zeiten für den lokalen Tag von `date` am Ort lat/lon.
export function sunTimes(date, lat, lon) {
  const noon = new Date(date);
  noon.setHours(12, 0, 0, 0);
  const lw = rad * -lon;
  const phi = rad * lat;
  const n = julianCycle(toDays(noon), lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const Jnoon = solarTransitJ(ds, M, L);
  const at = (angle) => {
    const Jset = solarTransitJ(approxTransit(hourAngle(angle * rad, phi, dec), lw, n), M, L);
    return [fromJulian(Jnoon - (Jset - Jnoon)), fromJulian(Jset)];
  };
  const [sunrise, sunset] = at(-0.833);
  const [dawn, dusk] = at(-6);
  return { dawn, sunrise, noon: fromJulian(Jnoon), sunset, dusk };
}

// ---------- Himmelsfarben ----------

const PHASES = {
  night:   { top: [11, 16, 38],   bottom: [31, 42, 85],   stars: 1 },
  dawn:    { top: [59, 74, 143],  bottom: [242, 160, 123], stars: 0.3 },
  day:     { top: [79, 157, 232], bottom: [182, 226, 255], stars: 0 },
  evening: { top: [74, 79, 154],  bottom: [245, 138, 60],  stars: 0 },
};

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp01 = (t) => Math.max(0, Math.min(1, t));

function blend(a, b, t) {
  const p = PHASES[a], q = PHASES[b];
  t = clamp01(t);
  return { top: mix(p.top, q.top, t), bottom: mix(p.bottom, q.bottom, t), stars: p.stars + (q.stars - p.stars) * t };
}

// Farben und Himmelskörper zum Zeitpunkt now.
// sun/moon.f: 0 = Aufgang (links), 1 = Untergang (rechts).
export function skyState(now, times) {
  const t = now.getTime();
  const { dawn, sunrise, sunset, dusk } = Object.fromEntries(Object.entries(times).map(([k, v]) => [k, v.getTime()]));
  const HOUR = 3_600_000;
  let colors;
  if (t < dawn || t >= dusk) colors = blend('night', 'night', 0);
  else if (t < sunrise) colors = blend('night', 'dawn', (t - dawn) / (sunrise - dawn));
  else if (t < sunrise + HOUR) colors = blend('dawn', 'day', (t - sunrise) / HOUR);
  else if (t < sunset - HOUR) colors = blend('day', 'day', 0);
  else if (t < sunset) colors = blend('day', 'evening', (t - (sunset - HOUR)) / HOUR);
  else colors = blend('evening', 'night', (t - sunset) / (dusk - sunset));

  const sun = t >= sunrise && t <= sunset ? { f: (t - sunrise) / (sunset - sunrise) } : null;
  let moon = null;
  if (!sun) {
    // Nacht vom Untergang bis zum nächsten Aufgang (ca. 24 h später).
    const start = t > sunset ? sunset : sunset - DAY_MS;
    const end = t > sunset ? sunrise + DAY_MS : sunrise;
    moon = { f: clamp01((t - start) / (end - start)) };
  }
  return { ...colors, sun, moon };
}

export const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;

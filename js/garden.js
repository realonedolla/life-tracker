// Garten: wird komplett aus den Daten abgeleitet, nichts davon wird gespeichert.
//
// Pflanzen    eine pro Tag mit erfülltem Plan; können welken
// Verfall     steigt pro unerfülltem Tag um 1, ein erfüllter Tag heilt um 2
//             ≥1: so viele Pflanzen welken · ≥2: Unkraut · ≥3: Himmel grauer, Brunnen trocken
// Bauwerke    Stunden-Meilensteine aller Sessions und Monumente geschaffter Ziele; verfallen nie

import { addDays } from './time.js';
import { dayStatus, firstActiveDay, sessionDuration, waterGoal, waterTotal } from './model.js';

export const HOUR_STRUCTURES = [
  { hours: 5, key: 'bench', name: 'Bank' },
  { hours: 12, key: 'lamp', name: 'Laterne' },
  { hours: 25, key: 'fountain', name: 'Brunnen' },
  { hours: 50, key: 'hut', name: 'Hütte' },
  { hours: 125, key: 'windmill', name: 'Windmühle' },
  { hours: 250, key: 'tower', name: 'Turm' },
];

// Monument je nach Schicht des Bereichs.
const MONUMENT_BY_LAYER = { dirt: 'statue', sand: 'statue', stone: 'flagTower', lava: 'flagTower', deep: 'crystalPillar', ice: 'crystalPillar' };

const HEAL_PER_DAY = 2;
const MAX_DECAY = 7;

export function decayLabel(decay) {
  if (decay === 0) return 'Der Garten blüht.';
  if (decay === 1) return 'Eine Pflanze welkt.';
  if (decay === 2) return 'Pflanzen welken, Unkraut wächst.';
  return 'Unkraut, welke Pflanzen, grauer Himmel und ein trockener Brunnen.';
}

export function gardenState(store) {
  const today = store.today;
  // Erst ab dem ersten Tag mit Einträgen zählen; davor war die App nur installiert.
  const first = firstActiveDay(store) ?? today;
  const plants = [];
  let decay = 0;
  for (let key = first; key < today; key = addDays(key, 1)) {
    if (dayStatus(store, key).fulfilled) {
      plants.push({ date: key });
      decay = Math.max(0, decay - HEAL_PER_DAY);
    } else {
      decay = Math.min(MAX_DECAY, decay + 1);
    }
  }
  // Heute heilt sofort, sobald erfüllt; bestraft wird erst nach Mitternacht.
  if (dayStatus(store, today).fulfilled) {
    plants.push({ date: today, fresh: true });
    decay = Math.max(0, decay - HEAL_PER_DAY);
  }

  // Stunden-Meilensteine: Zeitpunkt, an dem die Gesamtstunden die Schwelle überschritten.
  const ended = store.sessions.filter((s) => s.endAt).sort((a, b) => a.endAt - b.endAt);
  const structures = [];
  let sum = 0;
  let next = 0;
  for (const s of ended) {
    sum += sessionDuration(s) / 3_600_000;
    while (next < HOUR_STRUCTURES.length && sum >= HOUR_STRUCTURES[next].hours) {
      const h = HOUR_STRUCTURES[next];
      structures.push({ id: h.key, sprite: h.key, kind: 'hours', name: h.name, hours: h.hours, builtAt: s.endAt });
      next++;
    }
  }
  const runningHours = store.sessions.filter((s) => !s.endAt).reduce((h, s) => h + sessionDuration(s) / 3_600_000, 0);

  for (const goal of store.goals) {
    if (goal.status !== 'done' || !goal.completedAt) continue;
    const area = store.areas.find((a) => a.id === goal.areaId);
    structures.push({
      id: `goal-${goal.id}`, sprite: MONUMENT_BY_LAYER[area?.layer] || 'crystalPillar', kind: 'monument',
      name: `Monument: ${goal.title}`, goal, area, builtAt: goal.completedAt,
    });
  }
  structures.sort((a, b) => a.builtAt - b.builtAt);

  const day = store.days.find((d) => d.date === today);
  return {
    plants,
    decay,
    wilted: Math.min(plants.length, decay),
    weeds: decay >= 2 ? decay - 1 : 0,
    grey: decay >= 3 ? Math.min(0.65, 0.3 + (decay - 3) * 0.1) : 0,
    fountainDry: decay >= 3,
    watered: waterTotal(day) >= waterGoal(day, store.settings),
    totalHours: sum + runningHours,
    nextStructure: HOUR_STRUCTURES[next] || null,
    structures,
  };
}

// Himmel entsättigen, je weiter der Verfall fortgeschritten ist.
export function greySky(sky, amount) {
  if (!amount) return sky;
  const grey = (c) => { const l = Math.round(c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11); return c.map((v) => Math.round(v + (l - v) * amount)); };
  return { ...sky, top: grey(sky.top), bottom: grey(sky.bottom) };
}

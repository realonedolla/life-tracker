// Einmalige Anpassungen bestehender Daten beim Start. Jede Stufe läuft nur einmal.

import * as db from './db.js';

const STEPS = [
  // Doppelte Routine-Einträge (gleicher Tag, gleiche Routine) zusammenführen:
  // Behalten wird der erledigte bzw. älteste; Bonus und Uhrzeit werden übernommen.
  async function dedupeRoutines() {
    const entries = await db.getAll('entries');
    const groups = new Map();
    for (const e of entries) {
      if (e.kind !== 'routine' || !e.routineId) continue;
      const k = `${e.date}|${e.routineId}`;
      groups.set(k, [...(groups.get(k) || []), e]);
    }
    await db.tx('entries', 'readwrite', (s) => {
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        list.sort((a, b) => (b.doneAt ? 1 : 0) - (a.doneAt ? 1 : 0) || a.createdAt - b.createdAt);
        const [keep, ...rest] = list;
        const merged = {
          ...keep,
          doneAt: keep.doneAt || rest.find((e) => e.doneAt)?.doneAt || null,
          bonusDoneAt: keep.bonusDoneAt || rest.find((e) => e.bonusDoneAt)?.bonusDoneAt || null,
          slot: keep.slot || rest.find((e) => e.slot)?.slot || null,
        };
        s.entries.put(merged);
        rest.forEach((e) => s.entries.delete(e.id));
      }
    });
  },

  // Wasserziel 4 l → 3,5 l (nur wenn es noch auf dem alten Standard steht).
  // Arbeitsbereiche für die Kalenderwertung: Trading und Ecom.
  async function waterAndWorkAreas() {
    const row = await db.get('meta', 'settings');
    const settings = row?.value || {};
    if (!settings.waterGoalMl || settings.waterGoalMl === 4000) settings.waterGoalMl = 3500;
    if (!settings.workAreaIds) {
      const areas = await db.getAll('areas');
      settings.workAreaIds = areas.filter((a) => ['Trading', 'Ecom'].includes(a.name)).map((a) => a.id);
    }
    await db.setMeta('settings', settings);
  },
];

export async function migrate() {
  const done = await db.getMeta('migrations', 0);
  for (let i = done; i < STEPS.length; i++) {
    await STEPS[i]();
    await db.setMeta('migrations', i + 1);
  }
}

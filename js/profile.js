// Profil: Erfahrung, Level, Ausrüstung, Abzeichen und Rekorde – alles aus den Daten abgeleitet.

import { DEFAULT_LOOK, GEAR, GEAR_SLOTS, gearTier } from './character.js';
import {
  dayProductivity, dayStatus, firstActiveDay, sessionDuration, waterGoal, waterTotal,
} from './model.js';
import { addDays, appMinutes } from './time.js';
import * as db from './db.js';

// Erfahrungspunkte pro Handlung.
export const XP = {
  routine: 10, bonus: 5, task: 10, hour: 30, goldDay: 100, find: 50, goal: 300, waterDay: 10,
};

// Gesamt-XP, ab denen ein Level erreicht ist: 0, 100, 250, 450, 700 …
export const xpForLevel = (level) => 25 * (level - 1) * (level + 2);

export const TITLES = [
  [1, 'Lehrling'], [3, 'Schürfer'], [5, 'Gräber'], [8, 'Bergmann'], [12, 'Steiger'],
  [17, 'Obersteiger'], [23, 'Bergmeister'], [30, 'Legende'],
];
export const titleFor = (level) => TITLES.filter(([l]) => level >= l).at(-1)[1];

export const BADGES = [
  { id: 'firstFind', name: 'Erster Fund', desc: 'Ein Zwischenziel freigelegt', test: (s) => s.finds >= 1 },
  { id: 'firstGoal', name: 'Schatzjäger', desc: 'Ein Ziel komplett geschafft', test: (s) => s.goalsDone >= 1 },
  { id: 'firstGold', name: 'Goldrausch', desc: 'Den ersten Gold-Tag geschafft', test: (s) => s.goldDays >= 1 },
  { id: 'gold10', name: 'Goldader', desc: '10 Gold-Tage', test: (s) => s.goldDays >= 10 },
  { id: 'streak7', name: 'Eine Woche', desc: '7 Tage am Stück den Plan erfüllt', test: (s) => s.longestStreak >= 7 },
  { id: 'streak30', name: 'Unaufhaltsam', desc: '30 Tage am Stück den Plan erfüllt', test: (s) => s.longestStreak >= 30 },
  { id: 'hydrated', name: 'Hydriert', desc: 'An 30 Tagen das Wasserziel erreicht', test: (s) => s.waterFullDays >= 30 },
  { id: 'nightOwl', name: 'Nachteule', desc: 'Eine Session nach Mitternacht', test: (s) => s.nightOwl },
  { id: 'earlyBird', name: 'Frühaufsteher', desc: 'An 5 Tagen eine Routine vor 7 Uhr erledigt', test: (s) => s.earlyDays >= 5 },
  { id: 'marathon', name: 'Marathon', desc: 'Eine Session über 4 Stunden', test: (s) => s.longestSession >= 4 },
  { id: 'photographer', name: 'Fotograf', desc: 'An einem Tag alle 5 Fotos', test: (s) => s.fullPhotoDays >= 1 },
  { id: 'hours100', name: 'Hundert Stunden', desc: '100 Stunden in Sessions', test: (s) => s.totalHours >= 100 },
];

// Alle Kennzahlen, aus denen sich Profil, Ausrüstung und Abzeichen ergeben.
export function profileStats(store) {
  const today = store.today;
  const start = firstActiveDay(store);
  let longestStreak = 0, run = 0, goldDays = 0, waterFullDays = 0;
  if (start) {
    for (let key = start; key <= today; key = addDays(key, 1)) {
      const status = dayStatus(store, key);
      run = status.fulfilled ? run + 1 : key === today ? run : 0;
      longestStreak = Math.max(longestStreak, run);
      if (dayProductivity(store, key).gold) goldDays++;
      const day = store.days.find((d) => d.date === key);
      if (day && waterTotal(day) >= waterGoal(day, store.settings)) waterFullDays++;
    }
  }
  const sessionHours = store.sessions.map((s) => sessionDuration(s) / 3_600_000);
  const routinesDone = store.entries.filter((e) => e.kind === 'routine' && e.doneAt);
  const photosByDay = {};
  store.photos.filter((p) => p.slot).forEach((p) => { photosByDay[p.date] = (photosByDay[p.date] || 0) + 1; });
  const earlyDays = new Set(routinesDone
    .filter((e) => { const m = appMinutes(e.doneAt); return m >= 180 && m < 7 * 60; })
    .map((e) => e.date)).size;

  return {
    totalHours: sessionHours.reduce((a, b) => a + b, 0),
    longestSession: Math.max(0, ...sessionHours),
    longestStreak, goldDays, waterFullDays, earlyDays,
    routinesDone: routinesDone.length,
    bonusDone: store.entries.filter((e) => e.bonusDoneAt).length,
    tasksDone: store.entries.filter((e) => e.kind === 'task' && e.doneAt).length,
    finds: store.milestones.filter((m) => m.doneAt).length,
    goalsDone: store.goals.filter((g) => g.status === 'done').length,
    nightOwl: store.sessions.some((s) => appMinutes(s.startAt) >= 24 * 60 || (s.endAt && appMinutes(s.endAt) >= 24 * 60 && appMinutes(s.endAt) > appMinutes(s.startAt))),
    fullPhotoDays: Object.values(photosByDay).filter((n) => n >= 5).length,
  };
}

export function computeProfile(store) {
  const stats = profileStats(store);
  const xp = Math.round(
    stats.routinesDone * XP.routine + stats.bonusDone * XP.bonus + stats.tasksDone * XP.task
    + stats.totalHours * XP.hour + stats.goldDays * XP.goldDay + stats.finds * XP.find
    + stats.goalsDone * XP.goal + stats.waterFullDays * XP.waterDay,
  );
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const gear = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, gearTier(slot, stats[GEAR[slot].stat])]));
  return {
    stats, xp, level, title: titleFor(level),
    levelXp: xpForLevel(level), nextXp: xpForLevel(level + 1),
    gear,
    badges: BADGES.map((b) => ({ ...b, earned: b.test(stats) })),
  };
}

// ---------- Aussehen ----------

export async function getLook() {
  return { ...DEFAULT_LOOK, ...(await db.getMeta('look', {})) };
}
export const saveLook = (look) => db.setMeta('look', look);

// Was seit dem letzten Mal neu ist (Level, Ausrüstung, Abzeichen), für die Feier.
export async function newSinceLastSeen(profile) {
  const now = {
    level: profile.level,
    gear: Object.fromEntries(GEAR_SLOTS.map((s) => [s, profile.gear[s].index])),
    badges: profile.badges.filter((b) => b.earned).map((b) => b.id),
  };
  const seen = await db.getMeta('profileSeen', null);
  if (!seen) {
    await db.setMeta('profileSeen', now);
    return null;
  }
  const news = [];
  if (now.level > seen.level) news.push({ kind: 'level', text: `Level ${now.level}`, sub: profile.title });
  for (const s of GEAR_SLOTS) {
    if (now.gear[s] > (seen.gear?.[s] ?? 0)) news.push({ kind: 'gear', slot: s, text: profile.gear[s].tier.name, sub: GEAR[s].label });
  }
  for (const id of now.badges) {
    if (!seen.badges?.includes(id)) {
      const b = BADGES.find((x) => x.id === id);
      news.push({ kind: 'badge', text: b.name, sub: b.desc });
    }
  }
  return news.length ? { news, now } : null;
}

export const markSeen = (now) => db.setMeta('profileSeen', now);

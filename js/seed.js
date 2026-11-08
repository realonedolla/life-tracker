// Startdaten V1 laut Konzept. Werden nur beim allerersten Start geschrieben.

import * as db from './db.js';
import { newArea, newGoal, newMilestone, newRoutine, DEFAULT_SETTINGS } from './model.js';

// [Titel, Art, Zählweise, Einheit, Zielwert, Startwert, Zwischenziele]
// Zwischenziele: Text, [Text, Zielwert] oder { title, auto } für automatisch gezählte.
// Das letzte ist der Schatz am Tunnelende.
const AREAS = [
  {
    name: 'Sport', color: '#8a5a32', layer: 'dirt', pin: 'Handstand',
    goals: [
      ['Handstand', 'stages', null, '', null, 0, ['30 s an der Wand', '10 s frei', '30 s frei']],
      ['Handstand Push-up', 'stages', null, '', null, 0, ['5 Pike Push-ups', '1 an der Wand', '5 an der Wand', '1 frei']],
      ['100 Push-ups', 'number', 'best', 'Push-ups', 100, 0, [['50 am Stück', 50], ['75 am Stück', 75], ['100 am Stück', 100]]],
      ['10 min Plank', 'number', 'best', 'min', 10, 0, [['3 Minuten', 3], ['5 Minuten', 5], ['7 Minuten', 7], ['10 Minuten', 10]]],
      ['Posture gefixt', 'stages', null, '', null, 0, [{ title: '30 Tage Posture-Routine am Stück', auto: { routine: 'Posture-Übungen', days: 30 } }]],
      ['Muscle Up', 'stages', null, '', null, 0, ['12 Klimmzüge', '15 Klimmzüge', '20 Klimmzüge', '1 Muscle Up'],
        ['Start: 10 Klimmzüge.', 'Muscle Up erst, wenn eine Stange da ist.']],
    ],
  },
  {
    name: 'Trading', color: '#6f7480', layer: 'stone', pin: '100 Backtests',
    goals: [
      ['100 Backtests', 'number', 'sum', 'Backtests', 100, 0, [['25 Backtests', 25], ['50 Backtests', 50], ['75 Backtests', 75], ['100 Backtests', 100]]],
      ['Payout haben', 'stages', null, '', null, 0, ['Aaltra-Sim bestanden', 'Funded', 'Payout']],
    ],
  },
  {
    name: 'Ecom', color: '#5a3482', layer: 'deep', pin: '1000€ Umsatz',
    goals: [
      ['1000€ Umsatz', 'number', 'sum', '€', 1000, 0, [['100 €', 100], ['250 €', 250], ['500 €', 500], ['750 €', 750], ['1000 €', 1000]]],
      ['100k-Video', 'number', 'best', 'Views', 100000, 0, [['10k Views', 10000], ['50k Views', 50000], ['100k Views', 100000]]],
      ['1000 Follower', 'number', 'current', 'Follower', 1000, 0, [['250 Follower', 250], ['500 Follower', 500], ['1000 Follower', 1000]]],
    ],
  },
];

// [Titel, Mindestversion, Bonus, Zeitfenster, Bereich, Ziel]
const ROUTINES = [
  ['Dehnen', '25-min-Video', '20-min-Video', 'evening', 'Sport', 'Handstand'],
  ['Posture-Übungen', '1 Durchgang', '', 'morning', 'Sport', 'Posture gefixt'],
  ['Lesen', '1 Kapitel', '', 'evening', null, null],
  ['Sport', '1 Einheit', '', 'midday', 'Sport', null],
  ['Posten', '1 Slideshow/Video', '', 'midday', 'Ecom', null],
  ['Live traden', 'NY-Open', '', 'fixed', 'Trading', null],
];

export async function seedIfEmpty() {
  if (await db.getMeta('seededAt')) return false;

  const areas = [], goals = [], milestones = [], notes = [], routines = [];
  const goalByTitle = {};

  AREAS.forEach((a, ai) => {
    const area = newArea({ name: a.name, color: a.color, layer: a.layer, order: ai });
    a.goals.forEach(([title, kind, countMode, unit, target, startValue, steps, goalNotes = []], gi) => {
      const goal = newGoal({ areaId: area.id, title, kind, countMode, unit, target, startValue, order: gi });
      goalByTitle[title] = goal;
      if (title === a.pin) area.pinnedGoalId = goal.id;
      goals.push(goal);
      steps.forEach((step, si) => {
        if (step.auto) {
          milestones.push(newMilestone({ goalId: goal.id, title: step.title, order: si, auto: step.auto }));
          return;
        }
        const [text, value] = Array.isArray(step) ? step : [step, null];
        milestones.push(newMilestone({ goalId: goal.id, title: text, targetValue: value, order: si }));
      });
      goalNotes.forEach((text) => notes.push({ id: db.uid(), goalId: goal.id, text, createdAt: Date.now() }));
    });
    areas.push(area);
  });

  ROUTINES.forEach(([title, minVersion, bonus, window, areaName, goalTitle], i) => {
    const routine = newRoutine({
      title, minVersion, bonus, window, order: i,
      areaId: areas.find((a) => a.name === areaName)?.id ?? null,
      goalId: goalTitle ? goalByTitle[goalTitle].id : null,
    });
    if (window === 'fixed') {
      // NY-Open, nur an Börsentagen (Mo–Fr in New York).
      routine.fixed = { time: '09:30', timeZone: 'America/New_York' };
      routine.weekdays = [1, 2, 3, 4, 5];
    }
    routines.push(routine);
  });

  // Automatische Zwischenziele verweisen auf die Routine per ID.
  for (const m of milestones) {
    if (m.auto?.routine) m.auto = { type: 'routineStreak', routineId: routines.find((r) => r.title === m.auto.routine).id, days: m.auto.days };
  }

  await db.tx(['areas', 'goals', 'milestones', 'goalNotes', 'routines', 'meta'], 'readwrite', (s) => {
    areas.forEach((v) => s.areas.put(v));
    goals.forEach((v) => s.goals.put(v));
    milestones.forEach((v) => s.milestones.put(v));
    notes.forEach((v) => s.goalNotes.put(v));
    routines.forEach((v) => s.routines.put(v));
    s.meta.put({ key: 'settings', value: { ...DEFAULT_SETTINGS } });
    s.meta.put({ key: 'seededAt', value: Date.now() });
  });
  return true;
}

import { html, render, useCallback, useEffect, useRef, useState } from './vendor/preact-htm.js';
import * as db from './db.js';
import { seedIfEmpty } from './seed.js';
import { migrate } from './migrate.js';
import { ensureDay, getSettings } from './model.js';
import { dayKey, formatDate } from './time.js';
import { Icon } from './ui.js';
import { DataView } from './views/data.js';
import { World } from './views/world.js';
import { Today } from './views/today.js';
import { GoalView } from './views/goal.js';
import { CalendarView } from './views/calendar.js';
import { IdeasView } from './views/ideas.js';
import { dueReminders } from './reminders.js';

const TABS = [
  ['welt', 'Welt'],
  ['heute', 'Heute'],
  ['kalender', 'Kalender'],
  ['ideen', 'Ideen'],
];
const ROUTES = [...TABS.map(([key]) => key), 'daten'];

// '#/ziel/<id>' öffnet die Detailansicht eines Ziels.
function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '');
  if (r.startsWith('ziel/')) return r;
  return ROUTES.includes(r) ? r : 'welt';
}

function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

// Lädt den kompletten Datenbestand. Für Phase 1 reicht das; spätere Ansichten
// können gezielter laden, wenn es nötig wird.
function useStore() {
  const [state, setState] = useState(null);
  const reload = useCallback(async () => {
    const [data, settings, lastExportAt] = await Promise.all([
      db.dumpAll(), getSettings(), db.getMeta('lastExportAt'),
    ]);
    setState({ ...data, settings, lastExportAt, today: dayKey() });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return [state, reload];
}

function App() {
  const route = useRoute();
  const [store, reload] = useStore();
  const [toast, setToast] = useState(null);

  const notify = useCallback((text, kind = 'info') => {
    setToast({ text, kind, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Kommt die App wieder nach vorn oder läuft über Mitternacht, beginnt der neue Tag.
  useEffect(() => {
    const check = async (force) => {
      if (document.visibilityState !== 'visible') return;
      if (!force && store?.today === dayKey()) return;
      await ensureDay();
      reload();
    };
    const onVisible = () => check(true);
    const timer = setInterval(() => check(false), 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload, store?.today]);

  // Wird eine Erinnerung fällig, während die App offen ist: einmal kurz melden.
  // Was beim Öffnen schon fällig ist, steht in der Leiste und wird nicht extra gemeldet.
  const announced = useRef(null);
  useEffect(() => {
    if (!store) return undefined;
    const check = () => {
      const due = dueReminders(store, new Date());
      if (!announced.current) { announced.current = new Set(due.map((r) => r.id)); return; }
      const fresh = due.find((r) => !announced.current.has(r.id));
      due.forEach((r) => announced.current.add(r.id));
      if (fresh) notify(fresh.text);
    };
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [store, notify]);

  if (!store) return null;

  if (route.startsWith('ziel/')) {
    return html`
      <div class="shell world-shell">
        <${GoalView} store=${store} reload=${reload} notify=${notify} goalId=${route.slice(5)} />
        <${TabBar} route="welt" />
        ${toast && html`<div class="toast ${toast.kind}" role="status" key=${toast.id}>${toast.text}</div>`}
      </div>`;
  }

  if (route === 'welt') {
    return html`
      <div class="shell world-shell">
        <${World} store=${store} reload=${reload} notify=${notify} />
        <${TabBar} route=${route} />
        ${toast && html`<div class="toast ${toast.kind}" role="status" key=${toast.id}>${toast.text}</div>`}
      </div>`;
  }

  return html`
    <div class="shell">
      <header class="topbar">
        <span class="label date">${formatDate(store.today)}</span>
        <div class="right">
          <a class="btn secondary icon" href=${route === 'daten' ? '#/welt' : '#/daten'}
             aria-label="Daten und Sicherung" aria-current=${route === 'daten' ? 'page' : null}>
            <${Icon} name="daten" />
          </a>
        </div>
      </header>

      <main>
        ${route === 'daten' && html`<${DataView} store=${store} reload=${reload} notify=${notify} />`}
        ${route === 'heute' && html`<${Today} store=${store} reload=${reload} notify=${notify} />`}
        ${route === 'kalender' && html`<${CalendarView} store=${store} />`}
        ${route === 'ideen' && html`<${IdeasView} store=${store} reload=${reload} notify=${notify} />`}
      </main>

      <${TabBar} route=${route} />

      ${toast && html`<div class="toast ${toast.kind}" role="status" key=${toast.id}>${toast.text}</div>`}
    </div>`;
}

function TabBar({ route }) {
  return html`
    <nav class="tabbar" aria-label="Hauptnavigation">
      ${TABS.map(([key, label]) => html`
        <a class="tab" href="#/${key}" aria-current=${route === key ? 'page' : null}>
          <${Icon} name=${key} />
          <span class="label">${label}</span>
        </a>`)}
    </nav>`;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Lokal beim Entwickeln ohne Cache, außer mit ?sw im Link.
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has('sw')) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js');
  // Neue Version aktiv → einmal neu laden, damit alle Dateien zusammenpassen.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
}

async function boot() {
  const root = document.getElementById('app');
  try {
    await db.openDB();
    await seedIfEmpty();
    await migrate();
    await ensureDay();
    // Bittet den Browser, die Daten nicht bei Platzmangel zu löschen.
    navigator.storage?.persist?.();
  } catch (err) {
    console.error(err);
    render(html`<div class="shell"><section class="panel">
      <h2 class="label">Fehler</h2>
      <p>Die Datenbank konnte nicht geöffnet werden.</p>
      <p class="muted small">${String(err.message || err)}</p>
    </section></div>`, root);
    return;
  }
  render(html`<${App} />`, root);
  registerServiceWorker();
}

boot();

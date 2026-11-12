// Freunde: mitmachen, Code teilen, Freunde hinzufügen und gegenseitig den Stand sehen.

import { html, useEffect, useState } from '../vendor/preact-htm.js';
import { dayProductivity, streak } from '../model.js';
import { addDays, formatDate } from '../time.js';
import {
  addFriend, fetchFriends, join, leave, pushStats, removeFriend, syncConfigured, syncState,
} from '../sync.js';

const DAYS_SHOWN = 14;
const pct = (x) => `${Math.round(x * 100)} %`;
const hours = (h) => `${(Math.round(h * 10) / 10).toLocaleString('de-DE')} h`;

function useSyncState(deps = []) {
  const [state, setState] = useState(undefined);
  const refresh = () => syncState().then(setState);
  useEffect(() => { refresh(); }, deps);
  return [state, refresh];
}

// ---------- Einrichten (Daten-Ansicht) ----------

export function FriendsSetup({ store, notify }) {
  const [state, refresh] = useSyncState();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [friends, setFriends] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadFriends = () => fetchFriends(store.today).then(setFriends).catch(() => {});
  useEffect(() => { if (state?.joined) loadFriends(); }, [state?.joined]);

  const run = async (fn, okText) => {
    setBusy(true);
    try {
      await fn();
      if (okText) notify(okText);
    } catch (err) {
      notify(err.message.includes('Failed to fetch') ? 'Keine Verbindung zum Internet.' : err.message, 'error');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  if (!syncConfigured()) {
    return html`
      <section class="panel">
        <h2 class="label">Freunde</h2>
        <p class="muted small">Der Freunde-Abgleich ist noch nicht eingerichtet.</p>
      </section>`;
  }
  if (state === undefined) return null;

  if (!state?.joined) {
    return html`
      <section class="panel">
        <h2 class="label">Freunde</h2>
        <p class="small">Mit Freunden gegenseitig sehen, wie viel ihr erledigt habt. Geteilt wird nur eine Tageszusammenfassung: Prozent, Gold-Tag, Streak, Routinen (z. B. 5 von 6), Arbeitsstunden und Wasser. Keine Fotos, Notizen oder Zielnamen.</p>
        <label class="field">Dein Anzeigename<input value=${name} maxlength="40" onInput=${(e) => setName(e.target.value)} placeholder="z. B. Jonas" /></label>
        <div class="row sheet-actions">
          <button class="btn" disabled=${busy || !name.trim()} onClick=${() => run(async () => { await join(name.trim()); await pushStats(store); }, 'Du bist dabei.')}>Mitmachen</button>
        </div>
      </section>`;
  }

  const share = async () => {
    const text = `Mein Code für den Life Tracker: ${state.code}`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(state.code); notify('Code kopiert.'); } catch { notify(text); }
    }
  };

  return html`
    <section class="panel">
      <h2 class="label">Freunde</h2>
      <dl class="kv">
        <dt>Dein Name</dt><dd>${state.name}</dd>
        <dt>Dein Code</dt><dd class="code">${state.code}</dd>
        ${state.lastPush && html`<dt>Zuletzt geteilt</dt><dd>${new Date(state.lastPush).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd>`}
      </dl>
      <div class="row sheet-actions"><button class="btn secondary" onClick=${share}>Code teilen</button></div>

      <form class="inline-form friend-form" onSubmit=${(e) => {
        e.preventDefault();
        run(async () => { const f = await addFriend(code); setCode(''); await loadFriends(); notify(`${f.name} ist jetzt dein Freund.`); });
      }}>
        <input value=${code} maxlength="6" autocapitalize="characters" onInput=${(e) => setCode(e.target.value.toUpperCase())} placeholder="Code eines Freundes" aria-label="Code eines Freundes" />
        <button class="btn" type="submit" disabled=${busy || code.trim().length !== 6}>Hinzufügen</button>
      </form>

      ${friends.length > 0 && html`
        <ul class="list friend-list">
          ${friends.map((f) => html`
            <li key=${f.id}>
              <span>${f.name}</span>
              <button class="plain del" aria-label="${f.name} entfernen" onClick=${() => {
                if (confirm(`${f.name} als Freund entfernen? Ihr seht euch dann gegenseitig nicht mehr.`)) run(async () => { await removeFriend(f.id); await loadFriends(); });
              }}>×</button>
            </li>`)}
        </ul>`}

      <p class="small"><button class="link" disabled=${busy} onClick=${() => {
        if (confirm('Nicht mehr teilen? Dein Profil, deine Freundschaften und alle geteilten Tageswerte werden vom Server gelöscht. Deine Daten auf diesem Gerät bleiben.')) run(leave, 'Du teilst nichts mehr.');
      }}>Nicht mehr teilen</button></p>
    </section>`;
}

// ---------- Übersicht (Kalender) ----------

function Squares({ days, from }) {
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  return html`
    <div class="friend-squares" aria-hidden="true">
      ${Array.from({ length: DAYS_SHOWN }, (_, i) => {
        const key = addDays(from, i);
        const d = byDate[key];
        const lvl = !d ? 0 : d.gold ? 'gold' : 1 + Math.min(4, Math.floor(d.score * 5));
        return html`<span key=${key} class="sq lvl-${lvl}"></span>`;
      })}
    </div>`;
}

function PersonRow({ name, days, from, today, you }) {
  const t = days.find((d) => d.date === today);
  return html`
    <li class="friend-row ${you ? 'you' : ''}">
      <div class="friend-head">
        <b>${name}${you ? ' (du)' : ''}</b>
        <span class="small">${t ? (t.gold ? 'Gold-Tag' : `heute ${pct(t.score)}`) : 'heute noch nichts'}${t?.streak ? ` · Streak ${t.streak}` : ''}</span>
      </div>
      ${t && html`<div class="muted small">Routinen ${t.routines_done}/${t.routines_total} · Arbeit ${hours(t.work_hours)} · Wasser ${(t.water_ml / 1000).toLocaleString('de-DE')} l</div>`}
      <${Squares} days=${days} from=${from} />
    </li>`;
}

export function FriendsBoard({ store }) {
  const [state] = useSyncState();
  const [friends, setFriends] = useState(null);
  const [error, setError] = useState(null);
  const from = addDays(store.today, -(DAYS_SHOWN - 1));

  useEffect(() => {
    if (!state?.joined) return;
    pushStats(store).catch(() => {});
    fetchFriends(from).then(setFriends).catch((e) => setError(e.message));
  }, [state?.joined, store.today]);

  if (!syncConfigured() || !state?.joined) return null;

  // Eigene Zeile aus den lokalen Daten, damit sie auch offline stimmt.
  const st = streak(store, store.today);
  const own = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(from, i))
    .map((key) => ({ key, p: dayProductivity(store, key) }))
    .filter(({ p }) => p.level)
    .map(({ key, p }) => ({
      date: key, score: p.score, gold: p.gold, routines_done: p.routinesDone, routines_total: p.routinesTotal,
      work_hours: p.workHours, water_ml: p.water, streak: key === store.today ? st.count : 0,
    }));

  return html`
    <section class="panel">
      <h2 class="label">Du und Freunde</h2>
      <p class="muted small">Letzte ${DAYS_SHOWN} Tage, seit ${formatDate(from, { day: 'numeric', month: 'long' })}</p>
      <ul class="list">
        <${PersonRow} name=${state.name} days=${own} from=${from} today=${store.today} you />
        ${(friends || []).map((f) => html`<${PersonRow} key=${f.id} name=${f.name} days=${f.days} from=${from} today=${store.today} />`)}
      </ul>
      ${friends && friends.length === 0 && html`<p class="muted small">Noch keine Freunde. Teil deinen Code unter dem Zahnrad.</p>`}
      ${error && html`<p class="muted small">Freunde konnten nicht geladen werden (${error}).</p>`}
    </section>`;
}

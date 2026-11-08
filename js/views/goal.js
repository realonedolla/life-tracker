// Detailansicht eines Ziels: Der Tunnel gleitet nach oben und bleibt als schmaler Kopf stehen.

import { html, useLayoutEffect, useRef, useState } from '../vendor/preact-htm.js';
import { P, PixelCanvas } from '../pixel.js';
import { STRIP_H, drawStrip } from '../scene.js';
import {
  COUNT_MODES, GOAL_KINDS, addGoalValue, addMilestone, addNote, archiveGoal, autoProgress, createGoal,
  deleteGoal, deleteMilestone, deleteNote, goalTime, goalValue, pinGoal, removeGoalValues,
  reorderMilestones, routineStreak, setMilestoneDone, tunnelProgress, updateGoal, updateMilestone,
} from '../model.js';
import { formatDate, parseDayKey } from '../time.js';
import { Sheet, formatNumber } from '../ui.js';

const parseNum = (v) => parseFloat(String(v).replace(',', '.'));
const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`);
const dateOf = (ms) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

// Lage des angetippten Tunnels, damit der Kopf von dort nach oben gleiten kann.
let pendingRect = null;
export function openGoal(goalId, element) {
  pendingRect = element?.getBoundingClientRect() ?? null;
  location.hash = `#/ziel/${goalId}`;
}

export function GoalView({ store, reload, notify, goalId }) {
  const goal = store.goals.find((g) => g.id === goalId);
  const area = goal && store.areas.find((a) => a.id === goal.areaId);
  const head = useRef(null);
  const body = useRef(null);

  // Gleiten: Kopf startet an der Stelle des Tunnels und fährt nach oben.
  useLayoutEffect(() => {
    scrollTo(0, 0);
    const rect = pendingRect;
    pendingRect = null;
    if (!rect || !head.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = head.current;
    const dy = rect.top - el.getBoundingClientRect().top;
    el.style.transition = 'none';
    el.style.transform = `translateY(${dy}px)`;
    body.current.style.opacity = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'transform 360ms cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
      body.current.style.transition = 'opacity 300ms 180ms';
      body.current.style.opacity = '1';
    }));
  }, [goalId]);

  if (!goal) {
    return html`<section class="panel"><p>Dieses Ziel gibt es nicht mehr.</p><a class="btn secondary" href="#/welt">Zur Welt</a></section>`;
  }

  const progress = tunnelProgress(goal, store);
  const isNumber = goal.kind === 'number';
  const row = {
    progress,
    valueFrac: isNumber && goal.target ? progress.value / goal.target : null,
    digger: false,
  };
  const ctx = { store, reload, notify, goal };
  const seed = 11 + [...store.areas].sort((a, b) => a.order - b.order).indexOf(area) * 97;

  return html`
    <div class="goal-view">
      <header class="goal-head" ref=${head} style="height:calc(env(safe-area-inset-top) + ${(STRIP_H + 4) * P + 22}px)">
        <${PixelCanvas} deps=${[goal.id, progress.dug, progress.finds.map((f) => +f.reached).join(''), row.valueFrac]}
          draw=${(c, w, h) => drawStrip(c, w, h, { layer: area?.layer, row, seed })} />
        <div class="goal-head-bar">
          <a class="btn secondary icon back" href="#/welt" aria-label="Zurück zur Welt">‹</a>
          <div class="goal-head-title">
            <span class="label outlined small-label">${area?.name}</span>
            <span class="goal-name">${goal.title}</span>
          </div>
          <span class="goal-head-value num">${isNumber
            ? `${formatNumber(progress.value)}/${formatNumber(goal.target)}`
            : `${progress.done}/${progress.total}`}</span>
        </div>
      </header>

      <div class="goal-body" ref=${body}>
        ${goal.status === 'done' && html`
          <section class="panel treasure">
            <h2 class="label">Schatz freigelegt</h2>
            <p>Geschafft am ${dateOf(goal.completedAt)}. Das Monument an der Oberfläche kommt mit dem Garten in Phase 6.</p>
          </section>`}
        ${goal.status === 'archived' && html`
          <section class="panel"><p class="muted">Dieses Ziel ist archiviert und erscheint nicht in der Welt.</p>
            <button class="btn secondary" onClick=${async () => { await archiveGoal(goal, false); reload(); }}>Zurückholen</button>
          </section>`}

        ${isNumber && html`<${ValuePanel} ...${ctx} value=${progress.value} />`}
        <${Milestones} ...${ctx} />
        <${Notes} ...${ctx} />
        <${TimePanel} ...${ctx} />
        <${LinkedRoutines} ...${ctx} />
        <${GoalSettings} ...${ctx} pinned=${area?.pinnedGoalId === goal.id} />
      </div>
    </div>`;
}

// ---------- Zahlenwert ----------

const SOURCE = { manual: 'von Hand', session: 'Session', entry: 'Tagesziel' };

function ValuePanel({ store, reload, notify, goal, value }) {
  const [input, setInput] = useState('');
  const history = store.goalValues.filter((v) => v.goalId === goal.id).sort((a, b) => b.at - a.at).slice(0, 5);
  const isSum = goal.countMode === 'sum';

  const add = async (e) => {
    e.preventDefault();
    const n = parseNum(input);
    if (!Number.isFinite(n)) return;
    const r = await addGoalValue(goal.id, n);
    setInput('');
    await reload();
    const found = r.reached.map((m) => m.title).join(', ');
    notify(`${goal.title}: ${formatNumber(r.total)}${found ? ` · freigelegt: ${found}` : ''}`);
  };
  const remove = async (v) => {
    if (!confirm(`Eintrag ${formatNumber(v.value)} vom ${formatDate(v.date)} löschen?`)) return;
    await removeGoalValues({ valueId: v.id });
    reload();
  };

  return html`
    <section class="panel">
      <h2 class="label">Stand</h2>
      <p class="big-value num">${formatNumber(value)} <span class="muted">/ ${formatNumber(goal.target)} ${goal.unit}</span></p>
      <p class="muted small">${COUNT_MODES[goal.countMode]}: ${isSum ? 'Einträge werden addiert.' : goal.countMode === 'best' ? 'Es zählt der beste Wert.' : 'Es zählt der zuletzt eingetragene Stand.'}</p>
      <form class="inline-form" onSubmit=${add}>
        <input inputmode="decimal" placeholder=${isSum ? `+ ${goal.unit}` : `neuer ${COUNT_MODES[goal.countMode]}`}
          value=${input} onInput=${(e) => setInput(e.target.value)} aria-label="Wert eintragen" />
        <button class="btn" type="submit">Eintragen</button>
      </form>
      ${history.length > 0 && html`
        <ul class="list history">
          ${history.map((v) => html`
            <li key=${v.id}>
              <span class="num">${isSum ? '+' : ''}${formatNumber(v.value)}</span>
              <span class="muted small">${formatDate(v.date)} · ${SOURCE[v.source?.type] || 'von Hand'}</span>
              <button class="plain del" onClick=${() => remove(v)} aria-label="Eintrag löschen">×</button>
            </li>`)}
        </ul>`}
    </section>`;
}

// ---------- Zwischenziele ----------

function Milestones({ store, reload, notify, goal }) {
  const list = store.milestones.filter((m) => m.goalId === goal.id).sort((a, b) => a.order - b.order);
  const [order, setOrder] = useState(null); // Reihenfolge während des Ziehens
  const [drag, setDrag] = useState(null);
  const [edit, setEdit] = useState(null);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const listRef = useRef(null);
  const shown = order ? order.map((id) => list.find((m) => m.id === id)) : list;
  const currentId = shown.find((m) => !m.doneAt)?.id;
  const isNumber = goal.kind === 'number';
  const value = isNumber ? goalValue(goal, store.goalValues) : null;
  const canReorder = !isNumber && list.length > 1;

  const toggle = async (m) => {
    const r = await setMilestoneDone(m.id, !m.doneAt);
    await reload();
    if (r?.completed) notify(`Schatz freigelegt: ${goal.title}!`);
  };

  const add = async (e) => {
    e.preventDefault();
    const t = parseNum(target);
    const text = title.trim() || (Number.isFinite(t) ? `${formatNumber(t)} ${goal.unit}`.trim() : '');
    if (!text) return;
    await addMilestone(goal.id, { title: text, targetValue: Number.isFinite(t) ? t : null });
    setTitle(''); setTarget('');
    reload();
  };

  // Ziehen am Griff: Position ergibt sich aus den Mittelpunkten der Zeilen.
  const handle = (m) => ({
    class: 'tt-handle',
    'aria-label': `${m.title} verschieben`,
    onPointerDown: (e) => {
      e.preventDefault();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      setDrag(m.id);
      setOrder(list.map((x) => x.id));
    },
    onPointerMove: (e) => {
      if (drag !== m.id) return;
      const rows = [...listRef.current.children];
      const ids = order.filter((id) => id !== m.id);
      let index = ids.length;
      for (let i = 0, k = 0; i < rows.length; i++) {
        const id = rows[i].dataset.id;
        if (id === m.id) continue;
        const r = rows[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { index = k; break; }
        k++;
      }
      ids.splice(index, 0, m.id);
      if (ids.join() !== order.join()) setOrder(ids);
    },
    onPointerUp: async () => {
      const ids = order;
      setDrag(null);
      if (ids && ids.join() !== list.map((x) => x.id).join()) await reorderMilestones(ids);
      await reload();
      setOrder(null);
    },
    onPointerCancel: () => { setDrag(null); setOrder(null); },
  });

  return html`
    <section class="panel">
      <h2 class="label">Zwischenziele</h2>
      ${list.length === 0 && html`<p class="muted small">Noch keine. Jedes Zwischenziel wird ein Fund im Tunnel.</p>`}
      <ul class="list steps-list" ref=${listRef}>
        ${shown.map((m, i) => {
          const auto = autoProgress(m, store, store.today);
          const byValue = isNumber && m.targetValue != null;
          const manual = !auto && !byValue;
          const last = i === shown.length - 1;
          return html`
            <li key=${m.id} data-id=${m.id}
              class="${m.doneAt ? 'done' : ''} ${m.id === currentId ? 'current' : ''} ${drag === m.id ? 'dragging' : ''}">
              ${canReorder && html`<span ...${handle(m)}>⠿</span>`}
              ${manual
                ? html`<button class="check-btn ${m.doneAt ? 'on' : ''}" aria-pressed=${Boolean(m.doneAt)}
                    aria-label="${m.title} geschafft" onClick=${() => toggle(m)}></button>`
                : html`<span class="gem ${m.doneAt ? 'on' : ''}" aria-hidden="true"></span>`}
              <button class="plain step-text" onClick=${() => setEdit(m)}>
                <span class="step-title">${m.title}${last ? html` <span class="treasure-tag label">Schatz</span>` : ''}</span>
                <span class="muted small">
                  ${m.doneAt ? `geschafft am ${dateOf(m.doneAt)}`
                    : auto ? `${auto.value}/${auto.target} Tage am Stück · zählt automatisch`
                    : byValue ? `bei ${formatNumber(m.targetValue)} ${goal.unit} · noch ${formatNumber(Math.max(0, m.targetValue - value))}`
                    : m.id === currentId ? 'als Nächstes' : m.targetValue != null ? `Ziel: ${formatNumber(m.targetValue)}` : ''}
                </span>
                ${auto && !m.doneAt && html`<span class="bar"><span style="width:${Math.min(100, (auto.value / auto.target) * 100)}%"></span></span>`}
              </button>
            </li>`;
        })}
      </ul>
      <form class="task-form" onSubmit=${add}>
        <input placeholder="Zwischenziel hinzufügen" value=${title} onInput=${(e) => setTitle(e.target.value)} aria-label="Zwischenziel hinzufügen" />
        <div class="task-form-row">
          <input class="amount wide-amount" inputmode="decimal" placeholder=${isNumber ? `Zielwert (${goal.unit})` : 'Zielwert (optional)'}
            value=${target} onInput=${(e) => setTarget(e.target.value)} aria-label="Zielwert" />
          <button class="btn" type="submit">+</button>
        </div>
      </form>
      ${isNumber && html`<p class="muted small">Bei Zahlenzielen werden Funde mit Zielwert automatisch freigelegt und nach Wert sortiert.</p>`}
      ${edit && html`<${MilestoneSheet} milestone=${edit} goal=${goal} reload=${reload} onClose=${() => setEdit(null)} />`}
    </section>`;
}

function MilestoneSheet({ milestone, goal, reload, onClose }) {
  const [title, setTitle] = useState(milestone.title);
  const [target, setTarget] = useState(milestone.targetValue != null ? String(milestone.targetValue) : '');
  const save = async () => {
    const t = parseNum(target);
    await updateMilestone(milestone.id, { title: title.trim() || milestone.title, targetValue: Number.isFinite(t) ? t : null });
    await reload();
    onClose();
  };
  const remove = async () => {
    if (!confirm(`Zwischenziel „${milestone.title}“ löschen?`)) return;
    await deleteMilestone(milestone.id);
    await reload();
    onClose();
  };
  return html`
    <${Sheet} title="Zwischenziel" onClose=${onClose}>
      <label class="field">Titel<input value=${title} onInput=${(e) => setTitle(e.target.value)} /></label>
      ${!milestone.auto && html`
        <label class="field">Zielwert ${goal.unit ? `(${goal.unit})` : '(optional)'}
          <input inputmode="decimal" value=${target} onInput=${(e) => setTarget(e.target.value)} /></label>`}
      ${milestone.auto && html`<p class="muted small">Wird automatisch gezählt.</p>`}
      <div class="row sheet-actions">
        <button class="btn" onClick=${save}>Speichern</button>
        <button class="btn secondary danger" onClick=${remove}>Löschen</button>
      </div>
    <//>`;
}

// ---------- Notizen ----------

function Notes({ store, reload, goal }) {
  const [text, setText] = useState('');
  const notes = store.goalNotes.filter((n) => n.goalId === goal.id).sort((a, b) => b.createdAt - a.createdAt);
  const save = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await addNote(goal.id, text);
    setText('');
    reload();
  };
  const remove = async (n) => {
    if (!confirm('Notiz löschen?')) return;
    await deleteNote(n.id);
    reload();
  };
  return html`
    <section class="panel">
      <h2 class="label">Notizen</h2>
      <form class="note-form" onSubmit=${save}>
        <textarea rows="2" placeholder="Gedanke, Erkenntnis, nächster Schritt …" value=${text}
          onInput=${(e) => setText(e.target.value)} aria-label="Neue Notiz"></textarea>
        <button class="btn secondary" type="submit">Notiz speichern</button>
      </form>
      <ul class="list notes">
        ${notes.map((n) => html`
          <li key=${n.id}>
            <div class="note-meta muted small">${dateOf(n.createdAt)}
              <button class="plain del" onClick=${() => remove(n)} aria-label="Notiz löschen">×</button></div>
            <div class="note-text">${n.text}</div>
          </li>`)}
      </ul>
    </section>`;
}

// ---------- Investierte Zeit ----------

const MIN_DAYS_FOR_CHART = 28;

function isoWeek(key) {
  const d = parseDayKey(key);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86_400_000 + 1) / 7);
}

function TimePanel({ store, goal }) {
  const t = goalTime(goal, store, store.today);
  const last = t.lastDaysAgo == null ? 'noch keine'
    : t.lastDaysAgo === 0 ? 'heute' : t.lastDaysAgo === 1 ? 'gestern' : `vor ${t.lastDaysAgo} Tagen`;
  return html`
    <section class="panel">
      <h2 class="label">Investierte Zeit</h2>
      <dl class="kv">
        <dt>Gesamt</dt><dd>${hours(t.total)}</dd>
        <dt>Sessions</dt><dd>${t.count}</dd>
        <dt>Letzte Session</dt><dd>${last}</dd>
      </dl>
      ${t.dataDays >= MIN_DAYS_FOR_CHART
        ? html`<${WeekChart} weeks=${t.weeks.slice(-12)} />`
        : html`<p class="muted small chart-wait">Die Wochen-Grafik erscheint ab vier Wochen Daten${t.count ? ` (noch ${MIN_DAYS_FOR_CHART - t.dataDays} Tage)` : ''}.</p>`}
    </section>`;
}

// Stunden pro Woche, ein Datensatz: kein Legendenkasten, Tipp zeigt den Wert.
function WeekChart({ weeks }) {
  const [active, setActive] = useState(weeks.length - 1);
  const W = 320, H = 132, padL = 30, padB = 20, padT = 22;
  const max = Math.max(1, ...weeks.map((w) => w.hours));
  const niceMax = Math.ceil(max);
  const slot = (W - padL) / weeks.length;
  const bw = Math.min(24, slot - 2);
  const y = (h) => padT + (H - padT - padB) * (1 - h / niceMax);
  const base = y(0);
  const bar = (x, top) => {
    const r = Math.min(4, (base - top) / 2);
    return `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${base} Z`;
  };
  const a = weeks[active];
  const ax = padL + active * slot + (slot - bw) / 2 + bw / 2;
  return html`
    <figure class="week-chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stunden pro Woche, letzte ${weeks.length} Wochen">
        ${[niceMax, niceMax / 2].map((v) => html`
          <line x1=${padL} x2=${W} y1=${y(v)} y2=${y(v)} class="grid" />
          <text x=${padL - 6} y=${y(v) + 4} class="tick" text-anchor="end">${formatNumber(Math.round(v * 10) / 10)}</text>`)}
        <line x1=${padL} x2=${W} y1=${base} y2=${base} class="axis" />
        ${weeks.map((w, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          return html`
            ${w.hours > 0 && html`<path d=${bar(x, y(w.hours))} class="bar-mark ${i === active ? 'on' : ''}" />`}
            <rect x=${padL + i * slot} y=${padT - 20} width=${slot} height=${H - padT - padB + 20} class="hit"
              onPointerEnter=${() => setActive(i)} onClick=${() => setActive(i)} />`;
        })}
        <text x=${padL} y=${H - 4} class="tick">KW ${isoWeek(weeks[0].start)}</text>
        <text x=${W} y=${H - 4} class="tick" text-anchor="end">KW ${isoWeek(weeks.at(-1).start)}</text>
        ${a && html`<text x=${Math.min(W - 40, Math.max(padL + 40, ax))} y=${12} class="tip" text-anchor="middle">KW ${isoWeek(a.start)}: ${hours(a.hours)}</text>`}
      </svg>
      <table class="visually-hidden">
        <caption>Stunden pro Woche</caption>
        <tbody>${weeks.map((w) => html`<tr><th>KW ${isoWeek(w.start)}</th><td>${hours(w.hours)}</td></tr>`)}</tbody>
      </table>
    </figure>`;
}

// ---------- Verknüpfte Routinen ----------

function LinkedRoutines({ store, goal }) {
  const routines = store.routines.filter((r) => r.goalId === goal.id && r.active);
  if (!routines.length) return null;
  return html`
    <section class="panel">
      <h2 class="label">Verknüpfte Routinen</h2>
      <ul class="list">
        ${routines.map((r) => {
          const today = store.entries.find((e) => e.date === store.today && e.routineId === r.id);
          const streak = routineStreak(store, r.id, store.today);
          return html`
            <li key=${r.id}>
              <div class="goal-title"><span>${r.title}</span><span class="small ${today?.doneAt ? 'ok-text' : 'muted'}">${today ? (today.doneAt ? 'heute erledigt' : 'heute offen') : 'heute frei'}</span></div>
              <div class="muted small">Mindestens: ${r.minVersion} · ${streak} ${streak === 1 ? 'Tag' : 'Tage'} am Stück</div>
            </li>`;
        })}
      </ul>
    </section>`;
}

// ---------- Ziel bearbeiten ----------

export function GoalForm({ initial, onSubmit, submitLabel }) {
  const [f, setF] = useState(() => ({
    title: initial.title || '', kind: initial.kind || 'stages', countMode: initial.countMode || 'sum',
    unit: initial.unit || '', target: initial.target != null ? String(initial.target) : '',
    startValue: initial.startValue ? String(initial.startValue) : '',
  }));
  const set = (key) => (e) => { const v = e.target.value; setF((x) => ({ ...x, [key]: v })); };
  const submit = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const number = f.kind === 'number';
    const target = parseNum(f.target);
    if (number && !Number.isFinite(target)) return;
    onSubmit({
      title: f.title.trim(), kind: f.kind,
      countMode: number ? f.countMode : null, unit: number ? f.unit.trim() : '',
      target: number ? target : null, startValue: number ? parseNum(f.startValue) || 0 : 0,
    });
  };
  return html`
    <form class="goal-form" onSubmit=${submit}>
      <label class="field">Titel<input value=${f.title} onInput=${set('title')} required /></label>
      <fieldset class="field segmented">
        <legend>Art</legend>
        ${Object.entries(GOAL_KINDS).map(([k, label]) => html`
          <label class=${f.kind === k ? 'on' : ''}><input type="radio" name="kind" value=${k} checked=${f.kind === k} onChange=${set('kind')} />${label}</label>`)}
      </fieldset>
      ${f.kind === 'number' && html`
        <fieldset class="field segmented">
          <legend>Zählweise</legend>
          ${Object.entries(COUNT_MODES).map(([k, label]) => html`
            <label class=${f.countMode === k ? 'on' : ''}><input type="radio" name="mode" value=${k} checked=${f.countMode === k} onChange=${set('countMode')} />${label}</label>`)}
        </fieldset>
        <div class="form-grid three">
          <label class="field">Zielwert<input inputmode="decimal" value=${f.target} onInput=${set('target')} required /></label>
          <label class="field">Einheit<input value=${f.unit} onInput=${set('unit')} placeholder="z. B. Views" /></label>
          <label class="field">Startwert<input inputmode="decimal" value=${f.startValue} onInput=${set('startValue')} placeholder="0" /></label>
        </div>`}
      ${f.kind === 'milestone' && html`<p class="muted small">Ein einziger Fund am Tunnelende. Bis dahin graben die Session-Stunden.</p>`}
      <div class="row sheet-actions"><button class="btn" type="submit">${submitLabel}</button></div>
    </form>`;
}

function GoalSettings({ store, reload, notify, goal, pinned }) {
  const save = async (patch) => {
    await updateGoal(goal.id, patch);
    await reload();
    notify('Ziel gespeichert.');
  };
  const archive = async () => {
    await archiveGoal(goal, true);
    await reload();
    notify(`„${goal.title}“ archiviert.`);
    location.hash = '#/welt';
  };
  const remove = async () => {
    if (!confirm(`„${goal.title}“ endgültig löschen? Zwischenziele, Notizen und Werte gehen verloren. Die Session-Stunden bleiben beim Bereich.`)) return;
    await deleteGoal(goal);
    await reload();
    notify('Ziel gelöscht.');
    location.hash = '#/welt';
  };
  return html`
    <section class="panel">
      <details class="goal-settings">
        <summary class="label">Ziel bearbeiten</summary>
        <${GoalForm} key=${goal.id} initial=${goal} onSubmit=${save} submitLabel="Speichern" />
        <div class="row settings-actions">
          ${!pinned && goal.status === 'active' && html`
            <button class="btn secondary" onClick=${async () => { await pinGoal(goal); await reload(); notify('Angepinnt: erscheint jetzt auf dem Startscreen.'); }}>Anpinnen</button>`}
          ${goal.status !== 'archived' && html`<button class="btn secondary" onClick=${archive}>Archivieren</button>`}
          <button class="btn secondary danger" onClick=${remove}>Löschen</button>
        </div>
      </details>
    </section>`;
}

export function NewGoalSheet({ store, reload, notify, areaId, onClose }) {
  const area = store.areas.find((a) => a.id === areaId);
  const create = async (data) => {
    const goal = await createGoal({ ...data, areaId });
    await reload();
    notify(`Neues Ziel in ${area.name}: ${goal.title}`);
    onClose();
    openGoal(goal.id, null);
  };
  return html`
    <${Sheet} title="Neues Ziel · ${area?.name}" onClose=${onClose}>
      <${GoalForm} initial=${{}} onSubmit=${create} submitLabel="Ziel anlegen" />
    <//>`;
}

// Ideen-Korb: schnell rein, später aussortieren – zu Ziel, Zwischenziel, Archiv oder weg.

import { html, useState } from '../vendor/preact-htm.js';
import { addIdea, addMilestone, createGoal, deleteIdea, updateIdea } from '../model.js';
import { Sheet } from '../ui.js';
import { GoalForm, openGoal } from './goal.js';

const dateOf = (ms) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

function AreaChips({ store, value, onChange, allowNone = true }) {
  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  return html`
    <div class="chips">
      ${allowNone && html`<button type="button" class="pick ${value == null ? 'on' : ''}" aria-pressed=${value == null} onClick=${() => onChange(null)}>ohne Bereich</button>`}
      ${areas.map((a) => html`
        <button type="button" key=${a.id} class="pick ${value === a.id ? 'on' : ''}" aria-pressed=${value === a.id}
          style="--c:${a.color}" onClick=${() => onChange(a.id)}>${a.name}</button>`)}
    </div>`;
}

export function IdeasView({ store, reload, notify }) {
  const [text, setText] = useState('');
  const [areaId, setAreaId] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const open = store.ideas.filter((i) => i.status === 'open').sort((a, b) => b.createdAt - a.createdAt);
  const done = store.ideas.filter((i) => i.status !== 'open').sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const area = (id) => store.areas.find((a) => a.id === id);

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await addIdea(text, areaId);
    setText('');
    await reload();
    notify('Im Korb.');
  };

  return html`
    <section class="panel">
      <h2 class="label">Neue Idee</h2>
      <form class="idea-form" onSubmit=${add}>
        <textarea rows="2" placeholder="Gedanke festhalten …" value=${text} onInput=${(e) => setText(e.target.value)}
          aria-label="Neue Idee"></textarea>
        <${AreaChips} store=${store} value=${areaId} onChange=${setAreaId} />
        <button class="btn" type="submit">In den Korb</button>
      </form>
    </section>

    <section class="panel">
      <h2 class="label">Korb · ${open.length}</h2>
      ${open.length === 0 && html`<p class="muted small">Leer. Alles aussortiert.</p>`}
      <ul class="list ideas">
        ${open.map((idea) => html`
          <li key=${idea.id}>
            <button class="plain idea-row" onClick=${() => setSheet({ type: 'sort', idea })}>
              <span class="idea-text">${idea.text}</span>
              <span class="muted small">${dateOf(idea.createdAt)}${area(idea.areaId) ? html` · <span class="tag" style="--c:${area(idea.areaId).color}">${area(idea.areaId).name}</span>` : ''}</span>
            </button>
          </li>`)}
      </ul>
      ${open.length > 0 && html`<p class="muted small">Tipp auf eine Idee zum Aussortieren.</p>`}
    </section>

    ${done.length > 0 && html`
      <section class="panel">
        <button class="plain archive-toggle label" onClick=${() => setShowArchive(!showArchive)} aria-expanded=${showArchive}>
          Archiv · ${done.length} ${showArchive ? '▴' : '▾'}
        </button>
        ${showArchive && html`
          <ul class="list ideas archived">
            ${done.map((idea) => {
              const goal = idea.convertedTo && store.goals.find((g) => g.id === idea.convertedTo.goalId);
              return html`
                <li key=${idea.id}>
                  <div class="idea-text">${idea.text}</div>
                  <div class="muted small">
                    ${idea.status === 'converted'
                      ? html`${idea.convertedTo.type === 'goal' ? 'wurde Ziel' : 'wurde Zwischenziel bei'} ${goal ? html`<a class="link" href="#/ziel/${goal.id}">${goal.title}</a>` : '(gelöscht)'}`
                      : 'archiviert'}
                  </div>
                  <div class="row idea-actions">
                    <button class="btn secondary small-btn" onClick=${async () => { await updateIdea(idea.id, { status: 'open', convertedTo: null }); reload(); }}>Zurück in den Korb</button>
                    <button class="btn secondary small-btn danger" onClick=${async () => { if (confirm('Idee endgültig löschen?')) { await deleteIdea(idea.id); reload(); } }}>Löschen</button>
                  </div>
                </li>`;
            })}
          </ul>`}
      </section>`}

    ${sheet?.type === 'sort' && html`<${SortSheet} store=${store} reload=${reload} notify=${notify} idea=${sheet.idea} onClose=${() => setSheet(null)} />`}`;
}

// Aussortieren: eine Idee wird Ziel, Zwischenziel, archiviert oder gelöscht.
function SortSheet({ store, reload, notify, idea, onClose }) {
  const [step, setStep] = useState('choose');
  const [text, setText] = useState(idea.text);
  const [areaId, setAreaId] = useState(idea.areaId ?? [...store.areas].sort((a, b) => a.order - b.order)[0]?.id);
  const areas = [...store.areas].sort((a, b) => a.order - b.order);

  const saveText = async () => {
    if (text.trim() && text.trim() !== idea.text) await updateIdea(idea.id, { text: text.trim() });
  };
  const toGoal = async (data) => {
    const goal = await createGoal({ ...data, areaId });
    await updateIdea(idea.id, { status: 'converted', convertedTo: { type: 'goal', goalId: goal.id } });
    await reload();
    notify(`Neues Ziel: ${goal.title}`);
    onClose();
    openGoal(goal.id, null);
  };
  const toMilestone = async (goal) => {
    await addMilestone(goal.id, { title: text.trim() || idea.text });
    await updateIdea(idea.id, { status: 'converted', convertedTo: { type: 'milestone', goalId: goal.id } });
    await reload();
    notify(`Neues Zwischenziel bei ${goal.title}`);
    onClose();
  };
  const archive = async () => {
    await saveText();
    await updateIdea(idea.id, { status: 'archived' });
    await reload();
    notify('Archiviert.');
    onClose();
  };
  const remove = async () => {
    if (!confirm('Idee endgültig löschen?')) return;
    await deleteIdea(idea.id);
    await reload();
    notify('Gelöscht.');
    onClose();
  };
  const close = async () => { await saveText(); await reload(); onClose(); };

  return html`
    <${Sheet} title="Idee aussortieren" onClose=${close}>
      ${step === 'choose' && html`
        <label class="field">Idee<textarea rows="2" value=${text} onInput=${(e) => setText(e.target.value)}></textarea></label>
        <div class="sort-actions">
          <button class="btn" onClick=${() => setStep('goal')}>Zu neuem Ziel</button>
          <button class="btn secondary" onClick=${() => setStep('milestone')}>Zu Zwischenziel</button>
          <button class="btn secondary" onClick=${archive}>Archivieren</button>
          <button class="btn secondary danger" onClick=${remove}>Löschen</button>
        </div>`}

      ${step === 'goal' && html`
        <p class="muted small">In welchem Bereich?</p>
        <${AreaChips} store=${store} value=${areaId} onChange=${setAreaId} allowNone=${false} />
        <${GoalForm} initial=${{ title: text.trim() }} onSubmit=${toGoal} submitLabel="Ziel anlegen" />
        <button class="link small" onClick=${() => setStep('choose')}>‹ zurück</button>`}

      ${step === 'milestone' && html`
        <p class="muted small">„${text.trim()}“ wird Zwischenziel bei:</p>
        <div class="picker">
          ${areas.map((a) => {
            const goals = store.goals.filter((g) => g.areaId === a.id && g.status === 'active').sort((x, y) => x.order - y.order);
            if (!goals.length) return null;
            return html`
              <div class="pick-group" key=${a.id}>
                <span class="label pick-area-label">${a.name}</span>
                ${goals.map((g) => html`<button type="button" class="pick" key=${g.id} onClick=${() => toMilestone(g)}>${g.title}</button>`)}
              </div>`;
          })}
        </div>
        <button class="link small" onClick=${() => setStep('choose')}>‹ zurück</button>`}
    <//>`;
}

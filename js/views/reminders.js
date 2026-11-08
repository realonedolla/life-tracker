// Erinnerungsleiste oben in Welt und Heute.

import { html } from '../vendor/preact-htm.js';
import { dismiss, shownReminders } from '../reminders.js';
import { useTick } from './session.js';

// Die lange Session steht schon in der Session-Karte; die Leiste wiederholt sie nicht.
export function ReminderBar({ store, skip = [], onChange }) {
  useTick(30_000);
  const hidden = ['session', ...skip];
  const list = shownReminders(store, new Date(), hidden);
  if (!list.length) return null;
  return html`
    <div class="reminders" role="status">
      ${list.map((r) => html`
        <div class="reminder" key=${r.id}>
          <a class="reminder-text" href=${r.href}>${r.text}</a>
          <button class="plain reminder-x" aria-label="Für heute ausblenden"
            onClick=${() => { dismiss(store.today, r.id); onChange?.(); }}>×</button>
        </div>`)}
    </div>`;
}

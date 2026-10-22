// Events: admin actions broadcast by the kernel, plus this tab's own connection changes
// and rejected frames, newest first.

import { h } from '../dom';
import { session } from '../session';
import type { AppDef } from './app';

export const events: AppDef = {
  id: 'events',
  title: 'events',
  icon: 'i-events',
  summary: 'admin broadcasts and session log',
  create() {
    const list = h('ol', { class: 'log', 'aria-live': 'polite', 'aria-label': 'events, newest first' });
    const empty = h('p', { class: 'muted small', text: 'No events yet. Admin actions from any viewer appear here within one tick.' });
    const el = h('div', { class: 'app events', tabindex: -1 }, empty, list);
    let lastN = 0;
    const render = () => {
      const log = session.log;
      empty.hidden = log.length > 0;
      // The log is newest first; prepend the unseen entries oldest first.
      const fresh = log.filter((e) => e.n > lastN).reverse();
      for (const e of fresh) {
        const time = new Date(e.at).toLocaleTimeString([], { hour12: false });
        list.prepend(
          h('li', { class: `ev ${e.source}`, 'data-kind': e.kind },
            h('span', { class: 'when', text: e.step === null ? time : `${time}  step ${e.step}` }),
            h('span', { class: 'kind', text: e.kind.replace(/_/g, ' ') }),
            h('span', { class: 'what', text: e.text }),
          ),
        );
      }
      while (list.children.length > 200) list.lastElementChild?.remove();
      lastN = log[0]?.n ?? lastN;
    };
    const off = session.on('event', render);
    render();
    return { el, focus: () => el.focus(), destroy: off };
  },
};

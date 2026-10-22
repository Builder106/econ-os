// Keys: the binding map, read from the same table the key handler uses.

import { h } from '../dom';
import { HELP } from '../wm/bindings';
import type { AppDef } from './app';

export const keys: AppDef = {
  id: 'keys',
  title: 'keys',
  icon: 'i-keys',
  summary: 'keyboard map',
  create() {
    const el = h(
      'div',
      { class: 'app keys', tabindex: -1 },
      h('p', { class: 'small', text: 'Browsers and operating systems claim Super, Alt and most Ctrl chords, so EconOS uses an i3 binding mode. Every action also has a pointer path in the bar and pane title bars.' }),
      h(
        'table',
        { class: 'ledger keymap' },
        h('caption', { class: 'sr-only', text: 'key bindings' }),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'key' }), h('th', { scope: 'col', text: 'action' }))),
        h('tbody', {}, ...HELP.map(([k, a]) => h('tr', {}, h('td', {}, h('kbd', { text: k })), h('td', { text: a })))),
      ),
    );
    return { el, focus: () => el.focus(), destroy: () => undefined };
  },
};

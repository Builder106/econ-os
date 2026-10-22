// The boot splash reports only what the socket really does. It closes on the first tick,
// or shows the real failure and offers the desktop without a kernel.

import markSvg from '../design/mark.svg?raw';
import wordmarkSvg from '../design/wordmark.svg?raw';
import { KERNEL_WS_URL } from './config';
import { button, h } from './dom';
import { animate, motionOk } from './platform';
import { session } from './session';

export function mountSplash(onDone: () => void): void {
  // The splash replaces the static boot screen from index.html.
  document.getElementById('boot')?.remove();
  const mark = h('div', { class: 'splash-mark', 'aria-hidden': 'true' });
  mark.innerHTML = markSvg;
  const word = h('div', { class: 'splash-word', 'aria-hidden': 'true' });
  word.innerHTML = wordmarkSvg;
  const lines = h('ol', { class: 'splash-log', role: 'log', 'aria-live': 'polite' });
  const offline = button('open the desktop without a kernel', { class: 'act', hidden: true });
  const el = h('div', { class: 'splash', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'EconOS is connecting to the kernel' },
    h('div', { class: 'splash-plate' }, mark, word, h('p', { class: 'sr-only', text: 'EconOS is connecting to the shared kernel.' }), lines, offline));
  document.body.append(el);

  // The mark keeps drawing itself, the same loop as the boot screen, until a tick arrives.
  for (const id of ['mark-rule-outer', 'mark-rule-inner', 'mark-equal', 'mark-curve']) {
    mark.querySelector(`#${id}`)?.setAttribute('pathLength', '1');
  }
  mark.classList.add('mark-anim');

  const row = (k: string, v: string) => {
    const li = h('li', {}, h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v }));
    lines.append(li);
    return li;
  };
  row('kernel', KERNEL_WS_URL);
  const sock = row('socket', 'connecting');
  let failure: HTMLLIElement | null = null;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    offs.forEach((f) => f());
    onDone();
    if (!motionOk()) {
      el.remove();
      return;
    }
    animate(el, [{ opacity: 1 }, { opacity: 0 }], 160);
    setTimeout(() => el.remove(), 150);
  };

  const onConn = () => {
    const c = session.conn;
    const v = sock.querySelector('.v') as HTMLElement;
    if (c.state === 'open') v.textContent = 'open, waiting for the first tick';
    else if (c.state === 'connecting') v.textContent = c.attempt > 0 ? `connecting, attempt ${c.attempt + 1}` : 'connecting';
    else if (c.state === 'waiting') {
      v.textContent = c.lastError ?? 'closed';
      const s = Math.ceil(((c.retryAt ?? Date.now()) - Date.now()) / 1000);
      if (!failure) failure = row('retry', '');
      (failure.querySelector('.v') as HTMLElement).textContent = `in ${s} s (attempt ${c.attempt + 1}). No tick has arrived, so nothing on the desktop is live yet.`;
      offline.hidden = false;
    }
  };
  const onTick = () => {
    row('first tick', `step ${session.tick?.step ?? '?'}`);
    finish();
  };
  const offs = [session.on('conn', onConn), session.on('tick', onTick)];
  offline.addEventListener('click', finish);
  onConn();
}

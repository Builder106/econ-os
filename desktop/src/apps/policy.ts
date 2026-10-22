// Policy: the admin controls. They stay locked until sudo succeeds on this connection,
// and lock again on any reconnect. Each control sends the same shell line a person
// could type, so the kernel's own admin check is the authority.

import { runLine } from '../commands';
import { button, compact, h, icon, pct } from '../dom';
import { session } from '../session';
import type { AppDef } from './app';

export const policy: AppDef = {
  id: 'policy',
  title: 'policy',
  icon: 'i-policy',
  summary: 'admin controls',
  create() {
    const status = h('p', { class: 'result small', role: 'status', 'aria-live': 'polite' });
    const lockText = h('p', { class: 'lock-text' });
    const token = h('input', { type: 'password', id: 'policy-token', autocomplete: 'off', 'aria-label': 'admin token' });
    const unlock = button('unlock', { class: 'act' });
    const lockRow = h('form', { class: 'unlock' }, h('label', { for: 'policy-token', text: 'token' }), token, unlock);

    const taxIn = h('input', { type: 'number', id: 'policy-tax', min: 0, max: 100, step: 0.5, inputmode: 'decimal' });
    const taxBtn = button('set tax', { class: 'act', 'data-cmd': 'tax' });
    const shockKind = h('select', { id: 'policy-shock-kind', 'aria-label': 'shock target' }, h('option', { value: 'wage', text: 'wage' }), h('option', { value: 'price', text: 'price' }));
    const shockIn = h('input', { type: 'number', id: 'policy-shock', min: -50, max: 50, step: 1, value: 5, inputmode: 'decimal', 'aria-label': 'shock percent' });
    const shockBtn = button('apply shock', { class: 'act', 'data-cmd': 'shock' });
    const redistBtn = button('redistribute treasury', { class: 'act', 'data-cmd': 'redistribute' });
    const pauseBtn = button('pause', { class: 'act', 'data-cmd': 'pause' });
    const resetBtn = button('reset', { class: 'act danger', 'data-cmd': 'reset' });
    const now = h('p', { class: 'muted small', text: 'now: waiting for the first tick' });

    const controls = h(
      'fieldset',
      { class: 'controls' },
      h('legend', { class: 'sr-only', text: 'admin controls' }),
      h('div', { class: 'row' }, h('label', { for: 'policy-tax', text: 'income tax %' }), taxIn, taxBtn),
      h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'one-shot shock' }), shockKind, shockIn, h('span', { class: 'unit', text: '%' }), shockBtn),
      h('div', { class: 'row' }, redistBtn),
      h('div', { class: 'row' }, pauseBtn, resetBtn),
    );
    const lockIcon = h('span', { class: 'lock-ic' });
    const el = h('div', { class: 'app policy', tabindex: -1 }, h('div', { class: 'lock' }, lockIcon, lockText), lockRow, controls, now, status);

    const run = async (line: string, label: string) => {
      status.textContent = `${label}: sending`;
      const ack = await runLine(line);
      status.textContent = ack.ok ? `${label}: ${ack.output ?? 'done'}` : `${label} failed: ${ack.error ?? 'no reason given'}`;
      status.classList.toggle('err', !ack.ok);
    };

    lockRow.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = token.value.trim();
      token.value = '';
      if (!v) {
        status.textContent = 'enter the admin token first';
        return;
      }
      void run(`sudo ${v}`, 'sudo');
    });
    taxBtn.addEventListener('click', () => {
      const v = Number(taxIn.value);
      if (taxIn.value === '' || !Number.isFinite(v)) {
        status.textContent = 'tax: enter a percent from 0 to 100';
        return;
      }
      void run(`tax ${v}`, 'tax');
    });
    shockBtn.addEventListener('click', () => void run(`shock ${shockKind.value} ${Number(shockIn.value)}`, 'shock'));
    redistBtn.addEventListener('click', () => void run('redistribute', 'redistribute'));
    pauseBtn.addEventListener('click', () => void run(session.tick?.paused ? 'resume' : 'pause', session.tick?.paused ? 'resume' : 'pause'));
    let armed: number | null = null;
    resetBtn.addEventListener('click', () => {
      if (armed === null) {
        resetBtn.textContent = 'confirm reset';
        armed = window.setTimeout(() => {
          armed = null;
          resetBtn.textContent = 'reset';
        }, 4000);
        return;
      }
      clearTimeout(armed);
      armed = null;
      resetBtn.textContent = 'reset';
      void run('reset', 'reset');
    });

    const renderLock = () => {
      const admin = session.admin;
      controls.disabled = !admin;
      lockRow.hidden = admin;
      lockIcon.replaceChildren(icon(admin ? 'g-unlock' : 'g-lock'));
      lockText.textContent = admin
        ? 'Unlocked for this connection. Changes reach every viewer on the next tick.'
        : 'Locked. Run sudo <token> in Shell, or enter the token here. A reconnect locks it again.';
      el.classList.toggle('is-admin', admin);
    };
    const renderNow = () => {
      const t = session.tick;
      if (!t) return;
      now.textContent = `now: tax ${pct(t.policy.tax_rate)} | treasury ${compact(t.metrics.treasury)} | ${t.paused ? 'paused' : 'running'}`;
      pauseBtn.textContent = t.paused ? 'resume' : 'pause';
      if (document.activeElement !== taxIn && taxIn.value === '') taxIn.placeholder = (t.policy.tax_rate * 100).toFixed(1);
    };
    const offs = [session.on('admin', renderLock), session.on('tick', renderNow)];
    renderLock();
    renderNow();
    return {
      el,
      focus: () => (session.admin ? taxIn : token).focus(),
      destroy: () => offs.forEach((f) => f()),
    };
  },
};

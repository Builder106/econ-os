// The status bar: workspaces and the binding mode on the left, real kernel and session
// values on the right. Each block is plain text or a button; rules separate them.

import { APPS } from './apps';
import { KERNEL_HTTP_BASE } from './config';
import { button, fixed, h, icon, pct } from './dom';
import { effectiveTheme } from './platform';
import { session } from './session';
import type { Desktop } from './wm/desktop';
import { MODE_KEY } from './wm/bindings';
import { parentLayout, wsPanes } from './wm/tree';

export function connWords(): string {
  const c = session.conn;
  if (c.state === 'open') return session.tick ? 'connected' : 'socket open, waiting for a tick';
  if (c.state === 'connecting') return c.attempt > 0 ? `reconnecting, attempt ${c.attempt + 1}` : 'connecting';
  if (c.state === 'waiting') {
    const s = Math.max(0, Math.ceil(((c.retryAt ?? Date.now()) - Date.now()) / 1000));
    return `disconnected, retry in ${s} s`;
  }
  return 'disconnected';
}

/** The same state in one word, for the phone bar. */
function shortConnWords(): string {
  const c = session.conn;
  if (c.state === 'open') return session.tick ? 'live' : 'open';
  if (c.state === 'waiting') {
    const s = Math.max(0, Math.ceil(((c.retryAt ?? Date.now()) - Date.now()) / 1000));
    return `retry ${s}s`;
  }
  return c.state === 'connecting' ? 'connecting' : 'offline';
}

export function mountBar(bar: HTMLElement, desk: Desktop, openLauncher: () => void): void {
  const left = h('div', { class: 'bar-left' });
  const wsNav = h('nav', { class: 'workspaces', 'aria-label': 'workspaces' });
  const mode = h('span', { class: 'blk mode', role: 'status', 'aria-live': 'polite' });
  const runBtn = button('run', { class: 'blk btn', 'aria-label': 'run: open the launcher', 'data-bar': 'launcher' }, icon('i-launch', 14), h('span', { text: 'run' }));
  left.append(wsNav, mode, runBtn);

  const notice = h('span', { class: 'blk notice', role: 'status', 'aria-live': 'polite' });
  const conn = h('span', { class: 'blk conn', role: 'status', 'aria-live': 'polite', 'data-bar': 'conn' });
  const step = h('span', { class: 'blk', 'data-bar': 'step' });
  const paused = h('span', { class: 'blk', 'data-bar': 'paused', text: 'paused' });
  const tax = h('span', { class: 'blk wide', 'data-bar': 'tax' });
  const gini = h('span', { class: 'blk wide', 'data-bar': 'gini' });
  const actions = h('span', { class: 'blk wide', 'data-bar': 'actions' });
  const role = h('span', { class: 'blk', 'data-bar': 'role' });
  const viewers = h('span', { class: 'blk wide', 'data-bar': 'viewers', hidden: true });
  const layoutBtn = button('layout', { class: 'blk btn wide', 'data-bar': 'layout' });
  const scratchBtn = button('scratchpad', { class: 'blk btn', 'data-bar': 'scratchpad' });
  const themeBtn = button('theme', { class: 'blk btn wide', 'data-bar': 'theme' });
  const keysBtn = button('keys', { class: 'blk btn wide', 'data-bar': 'keys', 'aria-label': `keys help (${MODE_KEY.label} then ?)` }, icon('i-keys', 14));
  const right = h('div', { class: 'bar-right' }, notice, conn, step, paused, tax, gini, actions, viewers, role, layoutBtn, scratchBtn, themeBtn, keysBtn);
  bar.append(left, right);

  runBtn.addEventListener('click', openLauncher);
  layoutBtn.addEventListener('click', () => desk.cycleLayout());
  scratchBtn.addEventListener('click', () => desk.scratchShow());
  themeBtn.addEventListener('click', () => desk.toggleTheme());
  keysBtn.addEventListener('click', () => desk.open('keys'));

  const renderWs = () => {
    const nums = new Set(desk.state.workspaces.filter((w) => wsPanes(w).length > 0).map((w) => w.num));
    nums.add(desk.state.current);
    wsNav.replaceChildren(
      ...[...nums].sort((a, b) => a - b).map((n) => {
        const b = button(String(n), { class: 'ws', 'data-ws': n, 'aria-label': `workspace ${n}`, 'aria-current': n === desk.state.current ? 'true' : undefined });
        b.addEventListener('click', () => desk.switchTo(n));
        return b;
      }),
    );
    mode.textContent = desk.mode === 'none' ? '' : desk.mode === 'wm' ? 'wm' : 'resize';
    mode.hidden = desk.mode === 'none';
    const n = desk.state.scratchpad.length;
    scratchBtn.hidden = n === 0;
    scratchBtn.replaceChildren(icon('g-scratch', 14), h('span', { text: `scratch ${n}` }));
    scratchBtn.setAttribute('aria-label', `scratch ${n}: show ${desk.state.scratchpad.map((p) => APPS[p.app].title).join(', ')}`);
    const lay = desk.ws.focus ? parentLayout(desk.ws, desk.ws.focus) : null;
    layoutBtn.hidden = !lay;
    if (lay) {
      const word = { splith: 'split h', splitv: 'split v', tabbed: 'tabbed', stacked: 'stacked' }[lay];
      layoutBtn.replaceChildren(icon(`g-${lay}`, 14), h('span', { text: word }));
      layoutBtn.setAttribute('aria-label', `layout ${word}, click to change`);
    }
    const t = effectiveTheme();
    themeBtn.textContent = t;
    themeBtn.setAttribute('aria-label', `${t} theme, click to switch`);
  };

  const renderConn = () => {
    lastWords = connWords();
    conn.replaceChildren(
      icon(session.conn.state === 'open' ? 'g-link' : 'g-unlink', 14),
      h('span', { class: 'long', text: lastWords }),
      h('span', { class: 'short', 'aria-hidden': 'true', text: shortConnWords() }),
    );
    conn.classList.toggle('bad', session.conn.state !== 'open' || !session.tick);
  };

  const renderTick = () => {
    const tk = session.tick;
    step.textContent = tk ? `step ${tk.step}` : 'step –';
    paused.hidden = !tk?.paused;
    tax.textContent = tk ? `tax ${pct(tk.policy.tax_rate)}` : 'tax –';
    gini.textContent = tk ? `gini ${fixed(tk.metrics.gini, 4)}` : 'gini –';
    actions.textContent = tk ? (tk.policies_loaded ? 'trained policies' : 'sampled actions') : '';
    actions.hidden = !tk;
  };

  const renderRole = () => {
    role.replaceChildren(icon(session.admin ? 'g-unlock' : 'g-lock', 14), h('span', { text: session.admin ? 'admin' : 'visitor' }));
    role.classList.toggle('admin', session.admin);
  };

  const renderNotice = () => {
    const n = session.notice;
    const live = n && n.until > Date.now();
    notice.hidden = !live;
    notice.textContent = live ? n.text : '';
  };

  // The kernel reports how many sockets subscribe to it; that is the shared audience.
  const refreshViewers = async () => {
    if (session.conn.state !== 'open') {
      viewers.hidden = true;
      return;
    }
    try {
      const res = await fetch(`${KERNEL_HTTP_BASE}/healthz`, { cache: 'no-store' });
      const data: unknown = await res.json();
      const n = typeof data === 'object' && data !== null && 'subscribers' in data ? data.subscribers : null;
      viewers.hidden = typeof n !== 'number';
      if (typeof n === 'number') viewers.textContent = n === 1 ? '1 viewer' : `${n} viewers`;
    } catch {
      viewers.hidden = true;
    }
  };
  window.setInterval(() => void refreshViewers(), 15_000);
  session.on('conn', () => void refreshViewers());

  session.on('conn', renderConn);
  let lastWords = '';
  session.on('tick', () => {
    renderTick();
    renderNotice();
    if (connWords() !== lastWords) renderConn();
  });
  session.on('admin', renderRole);
  session.on('notice', renderNotice);
  desk.onChange(renderWs);
  window.addEventListener('econos-theme', renderWs);
  window.setInterval(() => {
    if (session.conn.state === 'waiting') renderConn();
    renderNotice();
  }, 1000);
  renderWs();
  renderConn();
  renderTick();
  renderRole();
  renderNotice();
}

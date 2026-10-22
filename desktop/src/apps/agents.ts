// Agents: every agent's id, role, balance and latest reward. Signs are printed; color
// only repeats them. The bar under each balance is its share of agent money.

import { fixed, h, signed } from '../dom';
import type { Agent } from '../protocol';
import { session } from '../session';
import type { AppDef } from './app';

type Key = 'id' | 'role' | 'balance' | 'reward';

export const agents: AppDef = {
  id: 'agents',
  title: 'agents',
  icon: 'i-agents',
  summary: 'balances and rewards',
  create() {
    let sortKey: Key = 'balance';
    let desc = true;
    const tbody = h('tbody');
    const headers: HTMLButtonElement[] = [];
    const th = (key: Key, label: string, num = false) => {
      const b = h('button', { type: 'button', class: 'sort', 'data-k': key, text: label });
      b.addEventListener('click', () => {
        if (sortKey === key) desc = !desc;
        else {
          sortKey = key;
          desc = key === 'balance' || key === 'reward';
        }
        update();
      });
      headers.push(b);
      return h('th', { scope: 'col', class: num ? 'num' : '' }, b);
    };
    const caption = h('caption', { class: 'muted small', text: 'agents appear with the first tick' });
    const table = h(
      'table',
      { class: 'ledger' },
      caption,
      h('thead', {}, h('tr', {}, th('id', 'id'), th('role', 'role'), th('balance', 'balance', true), th('reward', 'reward', true))),
      tbody,
    );
    const el = h('div', { class: 'app agents', tabindex: -1 }, table);
    const rows = new Map<string, HTMLTableRowElement>();

    const update = () => {
      const t = session.tick;
      if (!t) return;
      const list: Agent[] = [...t.agents];
      list.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const r = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return desc ? -r : r;
      });
      const total = list.reduce((s, a) => s + Math.max(0, a.balance), 0) || 1;
      const seen = new Set<string>();
      for (const a of list) {
        seen.add(a.id);
        let tr = rows.get(a.id);
        if (!tr) {
          tr = h('tr', { 'data-agent': a.id },
            h('td', { class: 'id' }),
            h('td', { class: 'role' }),
            h('td', { class: 'num bal' }, h('span', { class: 'n' }), h('span', { class: 'share', 'aria-hidden': 'true' })),
            h('td', { class: 'num rew' }),
          );
          rows.set(a.id, tr);
        }
        const [id, role, bal, rew] = Array.from(tr.cells);
        id.textContent = a.id;
        role.textContent = a.role;
        (bal.firstChild as HTMLElement).textContent = fixed(a.balance, 3);
        (bal.lastChild as HTMLElement).style.setProperty('--w', `${Math.min(100, (Math.max(0, a.balance) / total) * 100)}%`);
        bal.classList.toggle('neg', a.balance < 0);
        rew.textContent = signed(a.reward, 4);
        rew.className = `num rew ${a.reward > 0 ? 'pos' : a.reward < 0 ? 'neg' : ''}`;
        tbody.append(tr);
      }
      for (const [id, tr] of rows) {
        if (!seen.has(id)) {
          tr.remove();
          rows.delete(id);
        }
      }
      caption.textContent = `${list.length} agents at step ${t.step}, sorted by ${sortKey} ${desc ? 'high to low' : 'low to high'}. Reward is the agent's payoff on the last tick: utility for consumers, profit for producers. The rule under a balance is its share of all agent money.`;
      for (const b of headers) {
        const on = b.dataset.k === sortKey;
        b.setAttribute('aria-pressed', String(on));
        b.closest('th')?.setAttribute('aria-sort', on ? (desc ? 'descending' : 'ascending') : 'none');
      }
    };
    const off = session.on('tick', update);
    update();
    return { el, focus: () => el.focus(), destroy: off };
  },
};

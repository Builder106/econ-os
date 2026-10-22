// The launcher: a dmenu line over the left of the bar. Matches are apps (open or bring
// back from the scratchpad); anything else runs as a shell command.

import { APPS } from './apps';
import { runLine } from './commands';
import { h } from './dom';
import { session } from './session';
import type { Desktop } from './wm/desktop';
import { APP_IDS, type AppId, findApp } from './wm/tree';

interface Match {
  label: string;
  hint: string;
  run: () => void;
}

export function mountLauncher(bar: HTMLElement, desk: Desktop): () => void {
  const input = h('input', {
    id: 'launcher-input',
    type: 'text',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'launcher-list',
    'aria-autocomplete': 'list',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'open an app or run a shell command',
  });
  const list = h('ul', { id: 'launcher-list', role: 'listbox', 'aria-label': 'matches' });
  const form = h('form', { class: 'launcher', hidden: true }, h('label', { for: 'launcher-input', class: 'launcher-k', text: 'run:' }), input, list);
  bar.append(form);
  let matches: Match[] = [];
  let sel = 0;
  let returnTo: Element | null = null;

  const compute = () => {
    const q = input.value.trim().toLowerCase();
    const apps: Match[] = (APP_IDS as readonly AppId[])
      .filter((a) => !q || a.startsWith(q) || APPS[a].summary.includes(q))
      .map((a) => {
        const where = findApp(desk.state, a);
        const hint = where?.where === 'scratchpad' ? 'scratchpad' : where?.ws ? `ws ${where.ws.num}` : APPS[a].summary;
        return { label: a, hint, run: () => desk.open(a) };
      });
    matches = apps;
    if (q && !APP_IDS.includes(q as AppId)) {
      matches = [...apps, { label: input.value.trim(), hint: 'run in shell', run: () => void runCommand(input.value.trim()) }];
    }
    sel = Math.min(sel, Math.max(0, matches.length - 1));
    render();
  };

  const runCommand = async (line: string) => {
    const ack = await runLine(line);
    const text = ack.ok ? ack.output ?? 'done' : `error: ${ack.error ?? 'failed'}`;
    session.flash(`${line.split(/\s+/)[0]}: ${text.split('\n')[0]}`, 6000);
  };

  const render = () => {
    list.replaceChildren(
      ...matches.map((m, i) => {
        const li = h('li', { role: 'option', id: `launcher-opt-${i}`, 'aria-selected': String(i === sel), 'data-match': m.label },
          h('span', { class: 'm', text: m.label }), h('span', { class: 'hint', text: m.hint }));
        li.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          choose(i);
        });
        return li;
      }),
    );
    input.setAttribute('aria-activedescendant', matches.length ? `launcher-opt-${sel}` : '');
  };

  const close = () => {
    form.hidden = true;
    bar.classList.remove('launching');
    if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
    else desk.focusDom();
  };

  const choose = (i: number) => {
    const m = matches[i];
    close();
    if (m) m.run();
  };

  input.addEventListener('input', () => {
    sel = 0;
    compute();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      sel = (sel + 1) % Math.max(1, matches.length);
      render();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      sel = (sel - 1 + matches.length) % Math.max(1, matches.length);
      render();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) {
      choose(sel);
      return;
    }
    const exact = matches.findIndex((m) => m.label === q.toLowerCase());
    choose(exact >= 0 ? exact : sel);
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!form.contains(document.activeElement)) {
        form.hidden = true;
        bar.classList.remove('launching');
      }
    }, 0);
  });

  return () => {
    returnTo = document.activeElement;
    input.value = '';
    sel = 0;
    form.hidden = false;
    bar.classList.add('launching');
    compute();
    input.focus();
  };
}

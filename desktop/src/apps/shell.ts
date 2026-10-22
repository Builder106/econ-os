// Shell: the EconOS command line over the kernel socket. History never stores a token,
// and scrollback only ever shows the masked sudo line.

import { KERNEL_VERBS, LOCAL_VERBS, runLine } from '../commands';
import { h } from '../dom';
import { maskLine } from '../protocol';
import { session } from '../session';
import type { AppDef } from './app';

const history: string[] = [];

export const shell: AppDef = {
  id: 'shell',
  title: 'shell',
  icon: 'i-shell',
  summary: 'kernel command line',
  create() {
    const out = h('div', { class: 'scroll', role: 'log', 'aria-live': 'polite', 'aria-label': 'shell output' });
    const prompt = h('label', { class: 'prompt', for: 'shell-input' });
    const input = h('input', {
      id: 'shell-input',
      class: 'shell-input',
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      'aria-describedby': 'shell-hint',
    });
    const hint = h('p', { id: 'shell-hint', class: 'sr-only', text: 'Type help and press Enter. Up and Down recall history. Tab completes a command.' });
    const el = h('div', { class: 'app shell' }, out, h('div', { class: 'line' }, prompt, input), hint);
    let cursor = history.length;
    let draft = '';
    let busy = false;

    const renderPrompt = () => {
      prompt.textContent = session.admin ? 'admin@econos:~#' : 'visitor@econos:~$';
    };
    let rendered = 0;
    const renderOut = () => {
      if (session.shell.length < rendered) {
        out.textContent = '';
        rendered = 0;
      }
      const frag = document.createDocumentFragment();
      for (const line of session.shell.slice(rendered)) {
        const row = h('div', { class: `ln ${line.kind}` });
        row.textContent = line.kind === 'in' ? `${session.admin ? '#' : '$'} ${line.text}` : line.text;
        frag.append(row);
      }
      rendered = session.shell.length;
      out.append(frag);
      out.scrollTop = out.scrollHeight;
    };

    const complete = () => {
      const v = input.value;
      if (/\s/.test(v)) return;
      const hits = [...KERNEL_VERBS, ...LOCAL_VERBS].filter((c) => c.startsWith(v));
      if (hits.length === 1) input.value = `${hits[0]} `;
      else if (hits.length > 1) session.print('note', hits.join('  '));
    };

    input.addEventListener('keydown', async (e) => {
      if (e.isComposing) return;
      const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (busy) return;
        const line = input.value;
        input.value = '';
        if (line.trim()) {
          const kept = maskLine(line.trim()).startsWith('sudo') ? 'sudo ' : line.trim();
          if (history[history.length - 1] !== kept) history.push(kept);
        }
        cursor = history.length;
        draft = '';
        busy = true;
        input.setAttribute('aria-busy', 'true');
        await runLine(line);
        busy = false;
        input.removeAttribute('aria-busy');
        return;
      }
      if (e.key === 'ArrowUp' || (ctrl && e.key === 'p')) {
        e.preventDefault();
        if (cursor === history.length) draft = input.value;
        cursor = Math.max(0, cursor - 1);
        input.value = history[cursor] ?? draft;
        return;
      }
      if (e.key === 'ArrowDown' || (ctrl && e.key === 'n')) {
        e.preventDefault();
        cursor = Math.min(history.length, cursor + 1);
        input.value = cursor === history.length ? draft : history[cursor];
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey && input.value && !/\s/.test(input.value)) {
        e.preventDefault();
        complete();
        return;
      }
      if (!ctrl) return;
      const pos = input.selectionStart ?? input.value.length;
      if (e.key === 'a') {
        e.preventDefault();
        input.setSelectionRange(0, 0);
      } else if (e.key === 'e') {
        e.preventDefault();
        input.setSelectionRange(input.value.length, input.value.length);
      } else if (e.key === 'u') {
        e.preventDefault();
        input.value = input.value.slice(pos);
        input.setSelectionRange(0, 0);
      } else if (e.key === 'k') {
        e.preventDefault();
        input.value = input.value.slice(0, pos);
      } else if (e.key === 'l') {
        e.preventDefault();
        session.clearShell();
      } else if (e.key === 'c' && input.selectionStart === input.selectionEnd) {
        e.preventDefault();
        session.print('in', `${maskLine(input.value)}^C`);
        input.value = '';
      }
    });
    el.addEventListener('pointerup', () => {
      if (!window.getSelection()?.toString()) input.focus();
    });

    if (session.shell.length === 0) {
      // A short message of the day: one heading, then aligned label and value columns.
      session.print('head', 'EconOS shell | one shared kernel, the same run for every viewer');
      session.print('note', [
        '',
        '  consumers   sell labor, buy goods',
        '  producers   hire workers, set prices',
        '  actions     trained PPO policies, or random samples if none load',
        '',
        '  anyone      help  who  gini  inspect <agent>  top [N]',
        '  admin       sudo <token>, then',
        '              tax <pct>  shock <wage|price> <pct>',
        '              redistribute  pause  resume  reset',
        '',
      ].join('\n'));
    }
    const offs = [session.on('shell', renderOut), session.on('admin', renderPrompt)];
    renderPrompt();
    renderOut();
    return {
      el,
      focus: () => input.focus(),
      destroy: () => offs.forEach((f) => f()),
    };
  },
};

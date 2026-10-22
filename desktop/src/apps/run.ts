// Run: what this tab is connected to, and the read-only run snapshot. Every field comes
// from the kernel (/healthz, /export, ticks) or from this tab's own socket.

import { KERNEL_HTTP_BASE, KERNEL_WS_URL } from '../config';
import { button, duration, h } from '../dom';
import { track } from '../platform';
import { session } from '../session';
import type { AppDef } from './app';

interface RunInfo {
  id: string;
  started_at: string;
  start_reason: string;
  models: Record<string, { sha256: string | null; action_source: string }>;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readRun(v: unknown): { run: RunInfo; step: number } | null {
  if (!isRec(v) || v.format !== 'econos-run-snapshot' || v.schema_version !== 1) return null;
  const run = v.run;
  const state = v.state;
  if (!isRec(run) || !isRec(state) || typeof run.id !== 'string' || typeof state.step !== 'number') return null;
  const models: RunInfo['models'] = {};
  if (isRec(run.models)) {
    for (const [role, m] of Object.entries(run.models)) {
      if (isRec(m) && typeof m.action_source === 'string') {
        models[role] = { sha256: typeof m.sha256 === 'string' ? m.sha256 : null, action_source: m.action_source };
      }
    }
  }
  return {
    run: {
      id: run.id,
      started_at: typeof run.started_at === 'string' ? run.started_at : '',
      start_reason: typeof run.start_reason === 'string' ? run.start_reason : '',
      models,
    },
    step: state.step,
  };
}

async function fetchExport(): Promise<{ blob: Blob; parsed: ReturnType<typeof readRun> }> {
  const res = await fetch(`${KERNEL_HTTP_BASE}/export`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`the kernel answered HTTP ${res.status}`);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('the kernel sent a file that is not JSON');
  }
  const parsed = readRun(data);
  if (!parsed) throw new Error('the file is not a version 1 run snapshot');
  return { blob: new Blob([text], { type: 'application/json' }), parsed };
}

export const run: AppDef = {
  id: 'run',
  title: 'run',
  icon: 'i-run',
  summary: 'kernel, run and snapshot export',
  create() {
    const dl = h('dl', { class: 'facts' });
    const exportBtn = button('download snapshot', { class: 'act' });
    const result = h('p', { class: 'result small', role: 'status', 'aria-live': 'polite' });
    const el = h(
      'div',
      { class: 'app run', tabindex: -1 },
      dl,
      h('div', { class: 'row' }, exportBtn),
      h('p', { class: 'muted small', text: 'The snapshot is the current state with its run context: initial conditions, model digests and admin changes. It cannot replay the run exactly.' }),
      result,
    );
    let info: RunInfo | null = null;
    let subscribers: number | null = null;

    const fact = (k: string, v: string) => [h('dt', { text: k }), h('dd', { text: v })];
    const render = () => {
      const t = session.tick;
      const c = session.conn;
      const rows: HTMLElement[] = [];
      rows.push(...fact('kernel', KERNEL_WS_URL));
      rows.push(...fact('socket', c.state === 'open' ? 'open' : c.state === 'connecting' ? 'connecting' : c.state === 'waiting' ? 'waiting to retry' : 'closed'));
      if (t) {
        rows.push(...fact('step', String(t.step)));
        rows.push(...fact('kernel uptime', duration(t.uptime_s)));
        rows.push(...fact('actions', t.policies_loaded ? 'trained PPO policies' : 'random samples (trained policies are not loaded)'));
      }
      if (subscribers !== null) rows.push(...fact('viewers connected', String(subscribers)));
      if (info) {
        rows.push(...fact('run id', info.id));
        rows.push(...fact('run started', `${info.started_at.replace('T', ' ').slice(0, 19)} UTC (${info.start_reason.replace(/_/g, ' ')})`));
        for (const [role, m] of Object.entries(info.models)) {
          rows.push(...fact(`${role} model`, m.sha256 ? `sha256 ${m.sha256.slice(0, 16)}…` : m.action_source.replace(/_/g, ' ')));
        }
      }
      rows.push(...fact('frames rejected', String(session.rejectedFrames)));
      dl.replaceChildren(...rows);
    };

    const refreshHealth = async () => {
      try {
        const res = await fetch(`${KERNEL_HTTP_BASE}/healthz`, { cache: 'no-store' });
        const data: unknown = await res.json();
        subscribers = isRec(data) && typeof data.subscribers === 'number' ? data.subscribers : null;
      } catch {
        subscribers = null;
      }
      render();
    };
    const refreshRun = async () => {
      try {
        info = (await fetchExport()).parsed?.run ?? null;
      } catch {
        info = null;
      }
      render();
    };

    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      result.classList.remove('err');
      result.textContent = 'requesting the snapshot from the kernel';
      try {
        const { blob, parsed } = await fetchExport();
        if (!parsed) throw new Error('the file is not a version 1 run snapshot');
        info = parsed.run;
        const name = `econos-run-${parsed.run.id}-step-${parsed.step}.json`;
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: name });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        result.textContent = `saved ${name} (${(blob.size / 1024).toFixed(1)} KB)`;
        track('export_downloaded');
        render();
      } catch (err: unknown) {
        const why = err instanceof TypeError ? 'the kernel is unreachable' : err instanceof Error ? err.message : 'unknown error';
        result.textContent = `export failed: ${why}`;
        result.classList.add('err');
      } finally {
        exportBtn.disabled = false;
      }
    });

    const offs = [
      session.on('conn', () => {
        render();
        if (session.conn.state === 'open') void refreshHealth();
      }),
      session.on('event', () => {
        if (session.log[0]?.kind === 'reset') void refreshRun();
        render();
      }),
    ];
    let lastStep = -1;
    offs.push(session.on('tick', () => {
      const s = session.tick?.step ?? -1;
      if (s < lastStep) void refreshRun();
      lastStep = s;
      render();
    }));
    const timer = window.setInterval(() => void refreshHealth(), 15_000);
    render();
    void refreshHealth();
    void refreshRun();
    return {
      el,
      focus: () => exportBtn.focus(),
      destroy() {
        offs.forEach((f) => f());
        clearInterval(timer);
      },
    };
  },
};

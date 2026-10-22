// Session state shared by every app: the latest tick, the history seen since this
// browser joined, kernel events, shell scrollback and the admin flag.

import type { KernelEvent, Tick } from './protocol';

export type ConnState = 'connecting' | 'open' | 'waiting' | 'closed';

export interface Conn {
  state: ConnState;
  attempt: number;
  retryAt: number | null;
  lastError: string | null;
  everTicked: boolean;
}

export interface LogEntry {
  n: number;
  at: number;
  step: number | null;
  source: 'kernel' | 'session';
  kind: string;
  text: string;
}

export interface ShellLine {
  kind: 'in' | 'out' | 'err' | 'note' | 'head';
  text: string;
}

const HISTORY = 600;

type Topic = 'tick' | 'conn' | 'event' | 'admin' | 'shell' | 'notice';
type Listener = () => void;

class Session {
  conn: Conn = { state: 'connecting', attempt: 0, retryAt: null, lastError: null, everTicked: false };
  tick: Tick | null = null;
  joinedAt: number | null = null;
  steps: number[] = [];
  wages: number[] = [];
  prices: number[] = [];
  log: LogEntry[] = [];
  shell: ShellLine[] = [];
  admin = false;
  rejectedFrames = 0;
  notice: { text: string; until: number } | null = null;
  private listeners = new Map<Topic, Set<Listener>>();

  on(topic: Topic, fn: Listener): () => void {
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(topic: Topic): void {
    for (const fn of this.listeners.get(topic) ?? []) fn();
  }

  setConn(patch: Partial<Conn>): void {
    this.conn = { ...this.conn, ...patch };
    this.emit('conn');
  }

  pushTick(t: Tick): void {
    const prev = this.tick;
    this.tick = t;
    if (this.joinedAt === null) this.joinedAt = t.step;
    // A reset or cycle limit restarts the step count; start the traces again so the
    // plot never joins two runs.
    if (prev && t.step < prev.step) {
      this.steps = [];
      this.wages = [];
      this.prices = [];
      this.joinedAt = t.step;
    }
    if (!prev || t.step !== prev.step || this.steps.length === 0) {
      this.steps.push(t.step);
      this.wages.push(t.market.wage);
      this.prices.push(t.market.price);
      if (this.steps.length > HISTORY) {
        this.steps.shift();
        this.wages.shift();
        this.prices.shift();
      }
    }
    this.emit('tick');
  }

  private logSeq = 0;

  addLog(entry: Omit<LogEntry, 'n' | 'at' | 'step'>): void {
    this.log.unshift({ n: ++this.logSeq, at: Date.now(), step: this.tick?.step ?? null, ...entry });
    if (this.log.length > 200) this.log.pop();
    this.emit('event');
  }

  pushEvent(e: KernelEvent): void {
    const text = describeEvent(e);
    this.addLog({ source: 'kernel', kind: e.kind, text });
    this.flash(`${e.kind.replace(/_/g, ' ')}: ${text}`);
  }

  setAdmin(v: boolean): void {
    if (this.admin === v) return;
    this.admin = v;
    this.emit('admin');
  }

  print(kind: ShellLine['kind'], text: string): void {
    for (const line of text.split('\n')) this.shell.push({ kind, text: line });
    if (this.shell.length > 1000) this.shell.splice(0, this.shell.length - 1000);
    this.emit('shell');
  }

  clearShell(): void {
    this.shell = [];
    this.emit('shell');
  }

  flash(text: string, ms = 10_000): void {
    this.notice = { text, until: Date.now() + ms };
    this.emit('notice');
  }
}

const pct = (v: unknown) => (typeof v === 'number' ? `${(v * 100).toFixed(2)}%` : '');
const num = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : '');

export function describeEvent(e: KernelEvent): string {
  const d = e.detail;
  switch (e.kind) {
    case 'tax_changed':
      return `tax rate ${pct(d.tax_rate)} by ${e.by}`;
    case 'shock_applied': {
      const m = typeof d.magnitude === 'number' ? d.magnitude * 100 : 0;
      return `${String(d.kind)} shock ${m >= 0 ? '+' : '−'}${Math.abs(m).toFixed(2)}% by ${e.by}, lands next tick`;
    }
    case 'ubi_redistributed':
      return `${num(d.total)} from treasury, ${num(d.per_consumer)} per consumer, by ${e.by}`;
    case 'paused':
      return `kernel paused by ${e.by}`;
    case 'resumed':
      return `kernel resumed by ${e.by}`;
    case 'reset':
      return `simulation reset by ${e.by}`;
    default:
      return `${e.kind} by ${e.by}`;
  }
}

export const session = new Session();

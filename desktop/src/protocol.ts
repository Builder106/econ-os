// Kernel wire types and the guards every inbound frame must pass before use.
// The shapes mirror KernelService.snapshot() and server/commands.py.

export interface Agent {
  id: string;
  role: 'consumer' | 'producer';
  balance: number;
  reward: number;
}

export interface Tick {
  type: 'tick';
  step: number;
  uptime_s: number;
  paused: boolean;
  policies_loaded: boolean;
  market: { wage: number; price: number };
  policy: { tax_rate: number };
  metrics: {
    gini: number;
    cpi: number;
    real_gdp: number;
    lorenz_curve: { quantiles: number[]; cumulative_wealth: number[] };
    total_money: number;
    treasury: number;
  };
  agents: Agent[];
}

export interface KernelEvent {
  type: 'event';
  kind: string;
  by: string;
  detail: Record<string, unknown>;
}

export interface Ack {
  type: 'ack';
  id: unknown;
  ok: boolean;
  output?: string;
  error?: string;
  auth?: { is_admin: boolean };
}

export type Frame = Tick | KernelEvent | Ack;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNum);

function isAgent(v: unknown): v is Agent {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    (v.role === 'consumer' || v.role === 'producer') &&
    isNum(v.balance) &&
    isNum(v.reward)
  );
}

export function isTick(v: unknown): v is Tick {
  if (!isObj(v) || v.type !== 'tick') return false;
  if (!isNum(v.step) || !isNum(v.uptime_s)) return false;
  if (typeof v.paused !== 'boolean' || typeof v.policies_loaded !== 'boolean') return false;
  const { market, policy, metrics, agents } = v;
  if (!isObj(market) || !isNum(market.wage) || !isNum(market.price)) return false;
  if (!isObj(policy) || !isNum(policy.tax_rate)) return false;
  if (!isObj(metrics)) return false;
  for (const key of ['gini', 'cpi', 'real_gdp', 'total_money', 'treasury']) {
    if (!isNum(metrics[key])) return false;
  }
  const lorenz = metrics.lorenz_curve;
  if (!isObj(lorenz) || !isNumArray(lorenz.quantiles) || !isNumArray(lorenz.cumulative_wealth)) return false;
  if (lorenz.quantiles.length !== lorenz.cumulative_wealth.length) return false;
  return Array.isArray(agents) && agents.every(isAgent);
}

export function isEvent(v: unknown): v is KernelEvent {
  return (
    isObj(v) &&
    v.type === 'event' &&
    typeof v.kind === 'string' &&
    typeof v.by === 'string' &&
    isObj(v.detail)
  );
}

export function isAck(v: unknown): v is Ack {
  if (!isObj(v) || v.type !== 'ack' || typeof v.ok !== 'boolean') return false;
  if (v.output !== undefined && typeof v.output !== 'string') return false;
  if (v.error !== undefined && typeof v.error !== 'string') return false;
  if (v.auth !== undefined && !(isObj(v.auth) && typeof v.auth.is_admin === 'boolean')) return false;
  return true;
}

/** Parse one raw WebSocket payload. Returns null for anything that fails a guard. */
export function parseFrame(raw: unknown): Frame | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (isTick(data) || isEvent(data) || isAck(data)) return data;
  return null;
}

/** The first word of a shell line, for analytics. Arguments never leave the session. */
export function verbOf(line: string): string {
  return line.trim().split(/\s+/)[0] ?? '';
}

/** Mask the token in a sudo line so it never reaches scrollback or history. */
export function maskLine(line: string): string {
  const match = /^(\s*sudo)(\s+)(\S+)(.*)$/.exec(line);
  if (!match) return line;
  return `${match[1]}${match[2]}${'*'.repeat(8)}${match[4]}`;
}

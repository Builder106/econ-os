// One WebSocket per tab. The kernel is the only writer on its side, and this client is
// the only writer here: commands go out as {"type":"cmd"} frames and come back as acks
// on the same queue as ticks and events. A dropped socket drops admin elevation.

import { KERNEL_WS_URL } from './config';
import { type Ack, parseFrame } from './protocol';
import { session } from './session';

const MAX_BACKOFF_MS = 15_000;
const ACK_TIMEOUT_MS = 8_000;

interface Pending {
  resolve: (ack: Ack) => void;
  timer: number;
}

let socket: WebSocket | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let retryTimer: number | null = null;

function fail(id: number, error: string): void {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve({ type: 'ack', id, ok: false, error });
}

function onMessage(ev: MessageEvent): void {
  const frame = parseFrame(ev.data);
  if (!frame) {
    session.rejectedFrames += 1;
    session.addLog({ source: 'session', kind: 'rejected', text: 'rejected a malformed kernel frame' });
    return;
  }
  if (frame.type === 'tick') {
    if (!session.conn.everTicked || session.conn.attempt !== 0) {
      session.setConn({ everTicked: true, attempt: 0, lastError: null });
    }
    session.pushTick(frame);
    return;
  }
  if (frame.type === 'event') {
    session.pushEvent(frame);
    return;
  }
  if (frame.auth?.is_admin) session.setAdmin(true);
  const id = typeof frame.id === 'number' ? frame.id : NaN;
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(frame);
}

function scheduleRetry(): void {
  const attempt = session.conn.attempt + 1;
  const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
  session.setConn({ state: 'waiting', attempt, retryAt: Date.now() + delay });
  retryTimer = window.setTimeout(connect, delay);
}

export function connect(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  session.setConn({ state: 'connecting', retryAt: null });
  let ws: WebSocket;
  try {
    ws = new WebSocket(KERNEL_WS_URL);
  } catch (err: unknown) {
    session.setConn({ lastError: err instanceof Error ? err.message : 'could not open the socket' });
    scheduleRetry();
    return;
  }
  socket = ws;
  ws.addEventListener('open', () => {
    session.setConn({ state: 'open' });
    session.addLog({ source: 'session', kind: 'connected', text: `socket open to ${KERNEL_WS_URL}` });
  });
  ws.addEventListener('message', onMessage);
  ws.addEventListener('close', (ev) => {
    if (socket !== ws) return;
    socket = null;
    const wasAdmin = session.admin;
    session.setAdmin(false);
    for (const id of [...pending.keys()]) fail(id, 'connection lost before the kernel replied');
    const reason = `socket closed (code ${ev.code}${ev.reason ? `, ${ev.reason}` : ''})`;
    session.setConn({ lastError: reason });
    session.addLog({
      source: 'session',
      kind: 'disconnected',
      text: wasAdmin ? `${reason}; admin elevation dropped` : reason,
    });
    if (wasAdmin) session.print('note', 'connection lost: admin dropped. Run sudo <token> again after reconnect.');
    scheduleRetry();
  });
}

/** Send one shell line. Resolves with the kernel's ack, or a local failure ack. */
export function send(line: string): Promise<Ack> {
  const id = nextId++;
  return new Promise((resolve) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      resolve({ type: 'ack', id, ok: false, error: 'not connected to the kernel' });
      return;
    }
    const timer = window.setTimeout(() => fail(id, 'the kernel did not reply'), ACK_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    socket.send(JSON.stringify({ type: 'cmd', id, line }));
  });
}

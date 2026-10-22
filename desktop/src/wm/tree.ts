// The i3-style layout tree: workspaces hold a root container, containers hold panes or
// other containers, and each container has one layout. Everything here is plain data so
// it can be saved, validated and rebuilt.

export const APP_IDS = ['market', 'lorenz', 'agents', 'shell', 'policy', 'events', 'run', 'keys'] as const;
export type AppId = (typeof APP_IDS)[number];
export type Layout = 'splith' | 'splitv' | 'tabbed' | 'stacked';
export type Dir = 'left' | 'right' | 'up' | 'down';

export interface Pane {
  kind: 'pane';
  id: string;
  app: AppId;
}

export interface Con {
  kind: 'con';
  id: string;
  layout: Layout;
  children: Node[];
  sizes: number[];
  active: number;
}

export type Node = Pane | Con;

export interface Floating {
  pane: Pane;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Workspace {
  num: number;
  root: Con;
  floating: Floating[];
  focus: string | null;
  fullscreen: string | null;
  nextSplit: 'splith' | 'splitv' | null;
}

export interface WMState {
  v: 1;
  current: number;
  workspaces: Workspace[];
  scratchpad: Pane[];
}

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const pane = (app: AppId): Pane => ({ kind: 'pane', id: `p-${app}`, app });

export function con(layout: Layout, children: Node[], sizes?: number[]): Con {
  return {
    kind: 'con',
    id: uid('c'),
    layout,
    children,
    sizes: sizes ?? children.map(() => 1 / children.length),
    active: 0,
  };
}

export function emptyWorkspace(num: number): Workspace {
  return { num, root: con('splith', []), floating: [], focus: null, fullscreen: null, nextSplit: null };
}

export function defaultState(): WMState {
  const ws1 = emptyWorkspace(1);
  ws1.root = con('splith', [pane('market'), con('splitv', [pane('agents'), pane('shell')], [0.5, 0.5])], [0.58, 0.42]);
  ws1.focus = 'p-market';
  // Workspace 2 shows the less busy apps together, with Events and Run sharing a
  // tabbed container.
  const ws2 = emptyWorkspace(2);
  ws2.root = con('splith', [pane('lorenz'), con('splitv', [pane('policy'), con('tabbed', [pane('events'), pane('run')])], [0.44, 0.56])], [0.55, 0.45]);
  ws2.focus = 'p-lorenz';
  return { v: 1, current: 1, workspaces: [ws1, ws2], scratchpad: [] };
}

// ---------- queries ----------

export function workspace(s: WMState, num = s.current): Workspace {
  let ws = s.workspaces.find((w) => w.num === num);
  if (!ws) {
    ws = emptyWorkspace(num);
    s.workspaces.push(ws);
    s.workspaces.sort((a, b) => a.num - b.num);
  }
  return ws;
}

export function treePanes(node: Node): Pane[] {
  return node.kind === 'pane' ? [node] : node.children.flatMap(treePanes);
}

export function wsPanes(ws: Workspace): Pane[] {
  return [...treePanes(ws.root), ...ws.floating.map((f) => f.pane)];
}

interface Loc {
  parent: Con;
  index: number;
}

export function locate(root: Con, id: string): Loc | null {
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i];
    if (c.id === id) return { parent: root, index: i };
    if (c.kind === 'con') {
      const hit = locate(c, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Ancestors of a node from the root down, each with the child index on the path. */
export function pathTo(root: Con, id: string): Loc[] {
  const out: Loc[] = [];
  const walk = (c: Con): boolean => {
    for (let i = 0; i < c.children.length; i++) {
      const child = c.children[i];
      out.push({ parent: c, index: i });
      if (child.id === id) return true;
      if (child.kind === 'con' && walk(child)) return true;
      out.pop();
    }
    return false;
  };
  return walk(root) ? out : [];
}

export function findApp(s: WMState, app: AppId): { ws: Workspace | null; where: 'tree' | 'floating' | 'scratchpad' } | null {
  for (const ws of s.workspaces) {
    if (treePanes(ws.root).some((p) => p.app === app)) return { ws, where: 'tree' };
    if (ws.floating.some((f) => f.pane.app === app)) return { ws, where: 'floating' };
  }
  if (s.scratchpad.some((p) => p.app === app)) return { ws: null, where: 'scratchpad' };
  return null;
}

export function isFloating(ws: Workspace, id: string): boolean {
  return ws.floating.some((f) => f.pane.id === id);
}

// ---------- tree edits ----------

/** Remove a pane from a workspace (tree or floating). Returns it, and repairs the tree. */
export function detach(ws: Workspace, id: string): Pane | null {
  const fi = ws.floating.findIndex((f) => f.pane.id === id);
  if (fi >= 0) {
    const [f] = ws.floating.splice(fi, 1);
    afterRemoval(ws, id);
    return f.pane;
  }
  const loc = locate(ws.root, id);
  if (!loc) return null;
  const { parent, index } = loc;
  const [node] = parent.children.splice(index, 1);
  const [freed] = parent.sizes.splice(index, 1);
  const rest = parent.sizes.reduce((a, b) => a + b, 0);
  parent.sizes = rest > 0 ? parent.sizes.map((v) => v + (freed * v) / rest) : parent.sizes;
  parent.active = Math.min(parent.active, Math.max(0, parent.children.length - 1));
  flatten(ws.root);
  afterRemoval(ws, id, parent, index);
  return node.kind === 'pane' ? node : null;
}

function afterRemoval(ws: Workspace, id: string, parent?: Con, index = 0): void {
  if (ws.fullscreen === id) ws.fullscreen = null;
  if (ws.focus !== id) return;
  const sib = parent?.children[Math.min(index, parent.children.length - 1)];
  const target = sib ? treePanes(sib)[0] : undefined;
  ws.focus = target?.id ?? wsPanes(ws)[0]?.id ?? null;
}

/** Collapse containers left with one child, and drop empty ones. The root stays. */
export function flatten(c: Con): void {
  for (let i = c.children.length - 1; i >= 0; i--) {
    const child = c.children[i];
    if (child.kind !== 'con') continue;
    flatten(child);
    if (child.children.length === 0) {
      c.children.splice(i, 1);
      c.sizes.splice(i, 1);
      normalize(c);
    } else if (child.children.length === 1) {
      c.children[i] = child.children[0];
    }
  }
  if (c.children.length === 1 && c.children[0].kind === 'con') {
    const only = c.children[0];
    c.layout = only.layout;
    c.children = only.children;
    c.sizes = only.sizes;
    c.active = only.active;
  }
  c.active = Math.min(c.active, Math.max(0, c.children.length - 1));
}

function normalize(c: Con): void {
  const total = c.sizes.reduce((a, b) => a + b, 0);
  c.sizes = total > 0 ? c.sizes.map((v) => v / total) : c.children.map(() => 1 / Math.max(1, c.children.length));
}

/** Insert a pane next to the focused pane, honoring a pending split. */
export function insert(ws: Workspace, p: Pane): void {
  const focusLoc = ws.focus ? locate(ws.root, ws.focus) : null;
  if (!focusLoc) {
    ws.root.children.push(p);
    ws.root.sizes.push(1);
    normalize(ws.root);
    ws.root.active = ws.root.children.length - 1;
  } else if (ws.nextSplit) {
    const { parent, index } = focusLoc;
    const target = parent.children[index];
    if (parent.children.length === 1) {
      parent.layout = ws.nextSplit;
      parent.children.push(p);
      parent.sizes = [0.5, 0.5];
      parent.active = 1;
    } else {
      const wrap = con(ws.nextSplit, [target, p], [0.5, 0.5]);
      wrap.active = 1;
      parent.children[index] = wrap;
    }
  } else {
    const { parent, index } = focusLoc;
    parent.children.splice(index + 1, 0, p);
    const share = 1 / parent.children.length;
    parent.sizes = parent.sizes.map((v) => v * (1 - share));
    parent.sizes.splice(index + 1, 0, share);
    parent.active = index + 1;
  }
  ws.nextSplit = null;
  ws.focus = p.id;
  ws.fullscreen = null;
}

/** Make the path to a pane active, so tabbed and stacked parents show it. */
export function reveal(ws: Workspace, id: string): void {
  for (const step of pathTo(ws.root, id)) step.parent.active = step.index;
}

export function focusPane(ws: Workspace, id: string): void {
  ws.focus = id;
  reveal(ws, id);
}

export function swap(ws: Workspace, a: string, b: string): void {
  const la = locate(ws.root, a);
  const lb = locate(ws.root, b);
  if (!la || !lb) return;
  const na = la.parent.children[la.index];
  const nb = lb.parent.children[lb.index];
  la.parent.children[la.index] = nb;
  lb.parent.children[lb.index] = na;
}

export function setLayout(ws: Workspace, layout: Layout | 'toggle'): void {
  if (!ws.focus) return;
  const loc = locate(ws.root, ws.focus);
  if (!loc) return;
  const c = loc.parent;
  if (layout === 'toggle') {
    c.layout = c.layout === 'splith' ? 'splitv' : 'splith';
  } else {
    c.layout = layout;
  }
  c.active = loc.index;
}

export function parentLayout(ws: Workspace, id: string): Layout | null {
  return locate(ws.root, id)?.parent.layout ?? null;
}

export const MIN_SHARE = 0.12;

/** Grow (+) or shrink (−) the focused pane along an axis by a share of its container. */
export function resize(ws: Workspace, axis: 'h' | 'v', delta: number): boolean {
  if (!ws.focus) return false;
  const want: Layout = axis === 'h' ? 'splith' : 'splitv';
  const path = pathTo(ws.root, ws.focus);
  for (let i = path.length - 1; i >= 0; i--) {
    const { parent, index } = path[i];
    if (parent.layout !== want || parent.children.length < 2) continue;
    const other = index < parent.children.length - 1 ? index + 1 : index - 1;
    return shiftSize(parent, index, other, delta);
  }
  return false;
}

/** Move `delta` of share from `from` to `to`, keeping both above the minimum. */
export function shiftSize(c: Con, to: number, from: number, delta: number): boolean {
  const a = c.sizes[to] + delta;
  const b = c.sizes[from] - delta;
  if (a < MIN_SHARE || b < MIN_SHARE) return false;
  c.sizes[to] = a;
  c.sizes[from] = b;
  return true;
}

export function toggleFloating(ws: Workspace, id: string): void {
  const fi = ws.floating.findIndex((f) => f.pane.id === id);
  if (fi >= 0) {
    const [f] = ws.floating.splice(fi, 1);
    ws.focus = treePanes(ws.root)[0]?.id ?? null;
    insert(ws, f.pane);
    return;
  }
  const p = detach(ws, id);
  if (!p) return;
  const n = ws.floating.length;
  ws.floating.push({ pane: p, x: 0.22 + n * 0.03, y: 0.14 + n * 0.03, w: 0.5, h: 0.6 });
  ws.focus = p.id;
}

export function toScratchpad(s: WMState, ws: Workspace, id: string): void {
  const p = detach(ws, id);
  if (p) s.scratchpad.push(p);
}

/** i3 shows a scratchpad window as floating on the current workspace. */
export function fromScratchpad(s: WMState, ws: Workspace, app?: AppId): Pane | null {
  const i = app ? s.scratchpad.findIndex((p) => p.app === app) : 0;
  if (i < 0 || i >= s.scratchpad.length) return null;
  const [p] = s.scratchpad.splice(i, 1);
  ws.floating.push({ pane: p, x: 0.2, y: 0.12, w: 0.6, h: 0.7 });
  ws.focus = p.id;
  return p;
}

export function moveToWorkspace(s: WMState, from: Workspace, id: string, num: number): void {
  if (from.num === num) return;
  const p = detach(from, id);
  if (!p) return;
  const to = workspace(s, num);
  to.focus = treePanes(to.root).at(-1)?.id ?? null;
  insert(to, p);
}

/** i3 forgets an empty workspace once you leave it. */
export function pruneWorkspaces(s: WMState): void {
  s.workspaces = s.workspaces.filter((w) => w.num === s.current || wsPanes(w).length > 0);
}

// ---------- validation ----------

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const LAYOUTS: Layout[] = ['splith', 'splitv', 'tabbed', 'stacked'];
const fin = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function readPane(v: unknown, seen: Set<AppId>): Pane | null {
  if (!isRec(v) || v.kind !== 'pane' || !APP_IDS.includes(v.app as AppId)) return null;
  const app = v.app as AppId;
  if (seen.has(app)) return null;
  seen.add(app);
  return pane(app);
}

function readNode(v: unknown, seen: Set<AppId>, depth: number): Node | null {
  if (depth > 8 || !isRec(v)) return null;
  if (v.kind === 'pane') return readPane(v, seen);
  if (v.kind !== 'con' || !LAYOUTS.includes(v.layout as Layout) || !Array.isArray(v.children)) return null;
  const children: Node[] = [];
  const sizes: number[] = [];
  v.children.forEach((child, i) => {
    const n = readNode(child, seen, depth + 1);
    if (!n) return;
    children.push(n);
    const raw = Array.isArray(v.sizes) ? v.sizes[i] : undefined;
    sizes.push(fin(raw, 0.01, 1) ? raw : 1);
  });
  const c = con(v.layout as Layout, children, sizes);
  normalize(c);
  c.active = fin(v.active, 0, children.length - 1) ? Math.floor(v.active) : 0;
  return c;
}

/** Rebuild a state from storage. Anything malformed is dropped; nothing is trusted. */
export function readState(v: unknown): WMState | null {
  if (!isRec(v) || v.v !== 1 || !Array.isArray(v.workspaces)) return null;
  const seen = new Set<AppId>();
  const workspaces: Workspace[] = [];
  for (const w of v.workspaces) {
    if (!isRec(w) || !fin(w.num, 1, 9) || workspaces.some((x) => x.num === w.num)) continue;
    const ws = emptyWorkspace(Math.floor(w.num));
    const root = readNode(w.root, seen, 0);
    if (root && root.kind === 'con') {
      ws.root = root;
      flatten(ws.root);
    }
    if (Array.isArray(w.floating)) {
      for (const f of w.floating) {
        if (!isRec(f)) continue;
        const p = readPane(f.pane, seen);
        if (!p) continue;
        ws.floating.push({
          pane: p,
          x: fin(f.x, 0, 0.9) ? f.x : 0.2,
          y: fin(f.y, 0, 0.9) ? f.y : 0.15,
          w: fin(f.w, 0.15, 1) ? f.w : 0.5,
          h: fin(f.h, 0.15, 1) ? f.h : 0.6,
        });
      }
    }
    const ids = wsPanes(ws).map((p) => p.id);
    ws.focus = typeof w.focus === 'string' && ids.includes(w.focus) ? w.focus : (ids[0] ?? null);
    ws.fullscreen = typeof w.fullscreen === 'string' && ids.includes(w.fullscreen) ? w.fullscreen : null;
    workspaces.push(ws);
  }
  const scratchpad: Pane[] = [];
  if (Array.isArray(v.scratchpad)) {
    for (const p of v.scratchpad) {
      const ok = readPane(p, seen);
      if (ok) scratchpad.push(ok);
    }
  }
  if (workspaces.length === 0) return null;
  workspaces.sort((a, b) => a.num - b.num);
  const current = fin(v.current, 1, 9) ? Math.floor(v.current) : workspaces[0].num;
  const state: WMState = { v: 1, current, workspaces, scratchpad };
  workspace(state, current);
  for (const ws of state.workspaces) if (ws.focus) reveal(ws, ws.focus);
  return state;
}

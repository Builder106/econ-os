// Turn a workspace tree into pixel rectangles: one per visible pane, one per tab strip
// row, and one per draggable split between siblings.

import type { Con, Dir, Node, Pane, Workspace } from './tree';
import { treePanes } from './tree';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Strip {
  con: Con;
  rect: Rect;
  vertical: boolean;
}

export interface Handle {
  con: Con;
  index: number;
  rect: Rect;
  axis: 'h' | 'v';
  span: number;
}

export interface Geometry {
  panes: Map<string, Rect>;
  strips: Strip[];
  handles: Handle[];
}

export const TAB_H = 25;
const HANDLE = 6;

export function layoutWorkspace(ws: Workspace, area: Rect): Geometry {
  const g: Geometry = { panes: new Map(), strips: [], handles: [] };
  if (ws.fullscreen) {
    g.panes.set(ws.fullscreen, area);
    return g;
  }
  place(ws.root, area, g);
  for (const f of ws.floating) {
    g.panes.set(f.pane.id, {
      x: Math.round(area.x + f.x * area.w),
      y: Math.round(area.y + f.y * area.h),
      w: Math.round(f.w * area.w),
      h: Math.round(f.h * area.h),
    });
  }
  return g;
}

function place(node: Node, r: Rect, g: Geometry): void {
  if (node.kind === 'pane') {
    g.panes.set(node.id, r);
    return;
  }
  const c = node;
  const n = c.children.length;
  if (n === 0) return;
  if (c.layout === 'tabbed' || c.layout === 'stacked') {
    const rows = c.layout === 'tabbed' ? 1 : n;
    const head = Math.min(rows * TAB_H, Math.max(0, r.h - TAB_H));
    g.strips.push({ con: c, rect: { x: r.x, y: r.y, w: r.w, h: head }, vertical: c.layout === 'stacked' });
    place(c.children[c.active] ?? c.children[0], { x: r.x, y: r.y + head, w: r.w, h: r.h - head }, g);
    return;
  }
  const horizontal = c.layout === 'splith';
  const total = horizontal ? r.w : r.h;
  let offset = 0;
  c.children.forEach((child, i) => {
    const size = i === n - 1 ? total - offset : Math.round(total * c.sizes[i]);
    const cr = horizontal
      ? { x: r.x + offset, y: r.y, w: size, h: r.h }
      : { x: r.x, y: r.y + offset, w: r.w, h: size };
    place(child, cr, g);
    offset += size;
    if (i < n - 1) {
      g.handles.push({
        con: c,
        index: i,
        axis: horizontal ? 'h' : 'v',
        span: total,
        rect: horizontal
          ? { x: r.x + offset - HANDLE / 2, y: r.y, w: HANDLE, h: r.h }
          : { x: r.x, y: r.y + offset - HANDLE / 2, w: r.w, h: HANDLE },
      });
    }
  });
}

/**
 * The visible pane next to the focused one in a direction: the nearest along that axis,
 * among panes that share an edge span with it. Ties go to the pane aligned with the
 * focused pane's top (or left) edge, so moving right from a tall pane lands on the top
 * of a stack, as it does in i3.
 */
export function neighbor(g: Geometry, from: string, dir: Dir): string | null {
  const a = g.panes.get(from);
  if (!a) return null;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [id, b] of g.panes) {
    if (id === from) continue;
    let ahead: boolean;
    let overlap: boolean;
    let gap: number;
    let offset: number;
    if (dir === 'left' || dir === 'right') {
      ahead = dir === 'left' ? b.x + b.w <= a.x + 1 : b.x >= a.x + a.w - 1;
      overlap = b.y < a.y + a.h && b.y + b.h > a.y;
      gap = dir === 'left' ? a.x - (b.x + b.w) : b.x - (a.x + a.w);
      offset = Math.abs(b.y - a.y);
    } else {
      ahead = dir === 'up' ? b.y + b.h <= a.y + 1 : b.y >= a.y + a.h - 1;
      overlap = b.x < a.x + a.w && b.x + b.w > a.x;
      gap = dir === 'up' ? a.y - (b.y + b.h) : b.y - (a.y + a.h);
      offset = Math.abs(b.x - a.x);
    }
    if (!ahead) continue;
    const dist = Math.max(0, gap) * 10 + offset + (overlap ? 0 : 1_000_000);
    if (dist < bestScore) {
      bestScore = dist;
      best = id;
    }
  }
  return best;
}

/** Inside a tabbed (left/right) or stacked (up/down) parent, step between siblings. */
export function siblingStep(c: Con, dir: Dir): Pane | null {
  const forward = dir === 'right' || dir === 'down';
  const matches = (c.layout === 'tabbed' && (dir === 'left' || dir === 'right')) ||
    (c.layout === 'stacked' && (dir === 'up' || dir === 'down'));
  if (!matches) return null;
  const next = c.active + (forward ? 1 : -1);
  if (next < 0 || next >= c.children.length) return null;
  return treePanes(c.children[next])[0] ?? null;
}

// The window manager: owns the layout state, renders panes into the work area, and
// carries out every tiling operation for the keyboard, the bar and the title bars.

import { APPS } from '../apps';
import type { AppInstance } from '../apps/app';
import { button, h, icon } from '../dom';
import { animate, effectiveTheme, load, motionOk, save, track, applyTheme, type Theme } from '../platform';
import { type Action, wmAction, MODE_KEY } from './bindings';
import { type Geometry, type Rect, layoutWorkspace, neighbor, siblingStep } from './geometry';
import {
  APP_IDS, type AppId, type Dir, type Layout, type Pane, type WMState, type Workspace,
  defaultState, detach, findApp, focusPane, fromScratchpad, insert, isFloating, locate, moveToWorkspace,
  parentLayout, pathTo, pruneWorkspaces, readState, resize, setLayout, shiftSize, swap, toScratchpad,
  toggleFloating, treePanes, workspace, wsPanes,
} from './tree';

export type Mode = 'none' | 'wm' | 'resize';

const LAYOUT_CYCLE: Layout[] = ['splith', 'splitv', 'tabbed', 'stacked'];
const LAYOUT_GLYPH: Record<Layout, string> = { splith: 'g-splith', splitv: 'g-splitv', tabbed: 'g-tabbed', stacked: 'g-stacked' };
const LAYOUT_WORD: Record<Layout, string> = { splith: 'split h', splitv: 'split v', tabbed: 'tabbed', stacked: 'stacked' };
const phoneQuery = window.matchMedia('(max-width: 600px)');

interface Saved {
  wm: unknown;
  theme: Theme | null;
}

export class Desktop {
  state: WMState;
  mode: Mode = 'none';
  theme: Theme | null;
  readonly work: HTMLElement;
  private instances = new Map<AppId, AppInstance>();
  private paneEls = new Map<string, HTMLElement>();
  private placed = new Set<string>();
  private geo: Geometry = { panes: new Map(), strips: [], handles: [] };
  private chrome: HTMLElement;
  private menu: HTMLElement;
  private lastWs = 0;
  private saveTimer: number | null = null;
  private listeners = new Set<() => void>();
  private launcherHook: () => void = () => undefined;

  constructor(work: HTMLElement) {
    this.work = work;
    const saved = load();
    const rec = typeof saved === 'object' && saved !== null ? (saved as Partial<Saved>) : {};
    this.state = readState(rec.wm) ?? defaultState();
    this.theme = rec.theme === 'light' || rec.theme === 'dark' ? rec.theme : null;
    applyTheme(this.theme);
    this.chrome = h('div', { class: 'chrome' });
    this.menu = h('div', { class: 'menu', id: 'pane-menu', popover: 'auto', role: 'menu' });
    this.work.append(this.chrome, this.menu);
    window.addEventListener('resize', () => this.render());
    phoneQuery.addEventListener('change', () => this.render());
    window.addEventListener('keydown', (e) => this.onKey(e), { capture: true });
  }

  get phone(): boolean {
    return phoneQuery.matches;
  }

  get ws(): Workspace {
    return workspace(this.state, this.state.current);
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  setLauncher(fn: () => void): void {
    this.launcherHook = fn;
  }

  private changed(): void {
    this.render();
    for (const fn of this.listeners) fn();
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => save({ wm: this.state, theme: this.theme } satisfies Saved), 150);
  }

  // ---------- operations ----------

  open(app: AppId): void {
    const found = findApp(this.state, app);
    if (found?.where === 'scratchpad') {
      fromScratchpad(this.state, this.ws, app);
    } else if (found?.ws) {
      this.state.current = found.ws.num;
      focusPane(found.ws, `p-${app}`);
    } else {
      const p: Pane = { kind: 'pane', id: `p-${app}`, app };
      if (this.phone) this.ws.nextSplit = null;
      insert(this.ws, p);
      track('app_opened', { app });
    }
    pruneWorkspaces(this.state);
    this.changed();
    this.focusDom();
  }

  close(id = this.ws.focus): void {
    if (!id) return;
    const p = detach(this.ws, id);
    if (!p) return;
    this.instances.get(p.app)?.destroy();
    this.instances.delete(p.app);
    this.paneEls.get(id)?.remove();
    this.paneEls.delete(id);
    this.changed();
    this.focusDom();
  }

  focus(id: string, moveDom = false): void {
    if (this.ws.focus === id && !moveDom) return;
    focusPane(this.ws, id);
    this.changed();
    if (moveDom) this.focusDom();
  }

  focusDir(dir: Dir): void {
    const ws = this.ws;
    if (!ws.focus) return;
    if (this.phone) {
      const ids = wsPanes(ws).map((p) => p.id);
      const i = ids.indexOf(ws.focus);
      const step = dir === 'left' || dir === 'up' ? -1 : 1;
      const next = ids[i + step];
      if (next) this.focus(next, true);
      return;
    }
    const path = pathTo(ws.root, ws.focus);
    for (let i = path.length - 1; i >= 0; i--) {
      const sib = siblingStep(path[i].parent, dir);
      if (sib) {
        this.focus(sib.id, true);
        return;
      }
    }
    const next = neighbor(this.geo, ws.focus, dir);
    if (next) this.focus(next, true);
  }

  moveDir(dir: Dir): void {
    const ws = this.ws;
    if (!ws.focus || isFloating(ws, ws.focus)) return;
    const loc = locate(ws.root, ws.focus);
    let other: string | null = null;
    if (loc && (loc.parent.layout === 'tabbed' || loc.parent.layout === 'stacked')) {
      const forward = dir === 'right' || dir === 'down';
      const j = loc.index + (forward ? 1 : -1);
      const sib = loc.parent.children[j];
      other = sib ? sib.id : null;
      if (sib) {
        loc.parent.children[j] = loc.parent.children[loc.index];
        loc.parent.children[loc.index] = sib;
        loc.parent.active = j;
        this.changed();
        this.focusDom();
        return;
      }
    }
    other = neighbor(this.geo, ws.focus, dir);
    if (!other || isFloating(ws, other)) return;
    swap(ws, ws.focus, other);
    this.changed();
    this.focusDom();
  }

  switchTo(n: number): void {
    if (n === this.state.current) return;
    this.state.current = n;
    workspace(this.state, n);
    pruneWorkspaces(this.state);
    track('workspace_switched', { n });
    this.changed();
    this.focusDom();
  }

  sendTo(n: number, id = this.ws.focus): void {
    if (!id) return;
    moveToWorkspace(this.state, this.ws, id, n);
    this.changed();
  }

  split(layout: 'splith' | 'splitv'): void {
    this.ws.nextSplit = layout;
    this.changed();
  }

  layout(layout: Layout | 'toggle'): void {
    setLayout(this.ws, layout);
    this.changed();
  }

  cycleLayout(id = this.ws.focus): void {
    if (!id) return;
    const cur = parentLayout(this.ws, id);
    if (!cur) return;
    this.ws.focus = id;
    this.layout(LAYOUT_CYCLE[(LAYOUT_CYCLE.indexOf(cur) + 1) % LAYOUT_CYCLE.length]);
  }

  fullscreen(id = this.ws.focus): void {
    if (!id) return;
    const ws = this.ws;
    const before = this.geo.panes.get(id);
    ws.fullscreen = ws.fullscreen === id ? null : id;
    ws.focus = id;
    this.changed();
    this.flip(id, before);
  }

  floating(id = this.ws.focus): void {
    if (!id) return;
    toggleFloating(this.ws, id);
    this.changed();
    this.focusDom();
  }

  scratchSend(id = this.ws.focus): void {
    if (!id) return;
    toScratchpad(this.state, this.ws, id);
    this.changed();
    this.focusDom();
  }

  scratchShow(app?: AppId): void {
    if (this.state.scratchpad.length === 0) return;
    fromScratchpad(this.state, this.ws, app);
    this.changed();
    this.focusDom();
  }

  resizeStep(axis: 'h' | 'v', grow: boolean): void {
    const ws = this.ws;
    if (!ws.focus) return;
    const f = ws.floating.find((x) => x.pane.id === ws.focus);
    if (f) {
      const d = grow ? 0.04 : -0.04;
      if (axis === 'h') f.w = Math.min(1 - f.x, Math.max(0.15, f.w + d));
      else f.h = Math.min(1 - f.y, Math.max(0.15, f.h + d));
    } else if (!resize(ws, axis, grow ? 0.04 : -0.04)) {
      return;
    }
    this.changed();
  }

  toggleTheme(): void {
    this.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(this.theme);
    this.changed();
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    for (const fn of this.listeners) fn();
  }

  /** Move DOM focus into the focused pane's main control. */
  focusDom(): void {
    const id = this.ws.focus;
    const p = id ? wsPanes(this.ws).find((x) => x.id === id) : undefined;
    if (!p) return;
    this.instances.get(p.app)?.focus();
  }

  // ---------- keyboard ----------

  private onKey(e: KeyboardEvent): void {
    if (e.code === MODE_KEY.code && e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      this.setMode(this.mode === 'none' ? 'wm' : 'none');
      return;
    }
    if (this.mode === 'none') return;
    if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    e.preventDefault();
    e.stopPropagation();
    if (this.mode === 'resize') {
      if (e.code === 'Escape' || e.code === 'Enter') this.setMode('wm');
      else if (e.code === 'KeyH' || e.code === 'ArrowLeft') this.resizeStep('h', false);
      else if (e.code === 'KeyL' || e.code === 'ArrowRight') this.resizeStep('h', true);
      else if (e.code === 'KeyK' || e.code === 'ArrowUp') this.resizeStep('v', false);
      else if (e.code === 'KeyJ' || e.code === 'ArrowDown') this.resizeStep('v', true);
      return;
    }
    const action = wmAction(e);
    if (action) this.perform(action);
  }

  perform(a: Action): void {
    switch (a.do) {
      case 'focus': return this.focusDir(a.dir);
      case 'move': return this.moveDir(a.dir);
      case 'workspace': return this.switchTo(a.n);
      case 'send': return this.sendTo(a.n);
      case 'split': return this.split(a.layout);
      case 'layout': return this.layout(a.layout);
      case 'fullscreen': return this.fullscreen();
      case 'floating': return this.floating();
      case 'scratch-send': return this.scratchSend();
      case 'scratch-show': return this.scratchShow();
      case 'resize-mode': return this.setMode('resize');
      case 'close': return this.close();
      case 'theme': return this.toggleTheme();
      case 'exit':
        this.setMode('none');
        this.focusDom();
        return;
      case 'open':
        this.setMode('none');
        return this.open(a.app);
      case 'launcher':
        this.setMode('none');
        return this.launcherHook();
    }
  }

  // ---------- rendering ----------

  private instance(app: AppId): AppInstance {
    let inst = this.instances.get(app);
    if (!inst) {
      inst = APPS[app].create({ open: (a) => this.open(a) });
      this.instances.set(app, inst);
    }
    return inst;
  }

  private paneEl(p: Pane): HTMLElement {
    let el = this.paneEls.get(p.id);
    if (el) return el;
    const def = APPS[p.app];
    const tool = (glyph: string, label: string, act: string) =>
      button(label, { class: 'tool', 'data-act': act, 'aria-label': `${label} ${def.title}`, title: label }, icon(glyph));
    const name = h('button', { type: 'button', class: 'title-name', 'data-act': 'focus' }, icon(def.icon, 14), h('span', { text: def.title }));
    const tools = h(
      'div',
      { class: 'tools' },
      tool('g-splith', 'split horizontally', 'splith'),
      tool('g-splitv', 'split vertically', 'splitv'),
      tool('g-tabbed', 'change layout', 'layout'),
      tool('g-float', 'toggle floating', 'float'),
      tool('g-fullscreen', 'toggle fullscreen', 'fullscreen'),
      tool('g-scratch', 'send to scratchpad', 'scratch'),
      tool('g-move', 'move', 'move'),
      tool('g-close', 'close', 'close'),
    );
    const body = h('div', { class: 'body' }, this.instance(p.app).el);
    const grip = h('div', { class: 'grip', 'aria-hidden': 'true' });
    el = h('section', { class: 'pane', 'data-pane': p.id, 'data-app': p.app, 'aria-label': def.title },
      h('header', { class: 'title' }, name, tools), body, grip);
    el.addEventListener('pointerdown', () => this.focus(p.id));
    el.addEventListener('focusin', () => this.focus(p.id));
    tools.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-act]');
      if (b) this.toolAction(p.id, b.dataset.act ?? '', b);
    });
    name.addEventListener('click', () => this.focus(p.id, true));
    this.dragFloating(el.querySelector('header') as HTMLElement, p.id, 'move');
    this.dragFloating(grip, p.id, 'size');
    this.paneEls.set(p.id, el);
    return el;
  }

  private toolAction(id: string, act: string, anchor: HTMLElement): void {
    this.ws.focus = id;
    switch (act) {
      case 'splith': return this.split('splith');
      case 'splitv': return this.split('splitv');
      case 'layout': return this.cycleLayout(id);
      case 'float': return this.floating(id);
      case 'fullscreen': return this.fullscreen(id);
      case 'scratch': return this.scratchSend(id);
      case 'close': return this.close(id);
      case 'move': return this.openMoveMenu(id, anchor);
    }
  }

  private openMoveMenu(id: string, anchor: HTMLElement): void {
    const item = (label: string, fn: () => void) => {
      const b = button(label, { role: 'menuitem', class: 'menu-item' });
      b.addEventListener('click', () => {
        this.menu.hidePopover();
        fn();
      });
      return b;
    };
    const dirs: Dir[] = ['left', 'right', 'up', 'down'];
    const others = Array.from({ length: 9 }, (_, i) => i + 1).filter((n) => n !== this.state.current);
    this.menu.replaceChildren(
      h('p', { class: 'menu-k', text: 'swap with the pane' }),
      h('div', { class: 'menu-row' }, ...dirs.map((d) => item(d, () => { this.ws.focus = id; this.moveDir(d); }))),
      h('p', { class: 'menu-k', text: 'send to workspace' }),
      h('div', { class: 'menu-row' }, ...others.map((n) => item(String(n), () => this.sendTo(n, id)))),
    );
    const r = anchor.getBoundingClientRect();
    this.menu.style.left = `${Math.max(4, Math.min(window.innerWidth - 230, r.right - 220))}px`;
    this.menu.style.top = `${r.bottom + 4}px`;
    this.menu.showPopover();
    (this.menu.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  private dragFloating(handle: HTMLElement, id: string, kind: 'move' | 'size'): void {
    handle.addEventListener('pointerdown', (e) => {
      const f = this.ws.floating.find((x) => x.pane.id === id);
      if (!f || this.phone || (e.target as Element).closest('button')) return;
      e.preventDefault();
      const area = this.area();
      const start = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y, fw: f.w, fh: f.h };
      this.track((ev) => {
        const dx = (ev.clientX - start.x) / area.w;
        const dy = (ev.clientY - start.y) / area.h;
        if (kind === 'move') {
          f.x = Math.min(1 - f.w, Math.max(0, start.fx + dx));
          f.y = Math.min(1 - f.h, Math.max(0, start.fy + dy));
        } else {
          f.w = Math.min(1 - f.x, Math.max(0.15, start.fw + dx));
          f.h = Math.min(1 - f.y, Math.max(0.15, start.fh + dy));
        }
        this.render();
      });
    });
  }

  /** Follow one pointer drag on the window, then save the result. */
  private track(move: (ev: PointerEvent) => void): void {
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.changed();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private area(): Rect {
    const r = this.work.getBoundingClientRect();
    return { x: 0, y: 0, w: Math.round(r.width), h: Math.round(r.height) };
  }

  render(): void {
    const ws = this.ws;
    for (const f of ws.floating) {
      f.w = Math.min(1, Math.max(0.15, f.w));
      f.h = Math.min(1, Math.max(0.15, f.h));
      f.x = Math.min(1 - f.w, Math.max(0, f.x));
      f.y = Math.min(1 - f.h, Math.max(0, f.y));
    }
    const area = this.area();
    const phone = this.phone;
    this.work.classList.toggle('phone', phone);
    this.work.setAttribute('aria-label', `workspace ${ws.num}`);
    const visiblePanes = wsPanes(ws);
    let geo: Geometry;
    const chrome: HTMLElement[] = [];
    if (phone) {
      const strip = h('nav', { class: 'phone-tabs', 'aria-label': `apps on workspace ${ws.num}` });
      for (const p of visiblePanes) {
        const b = button(APPS[p.app].title, { class: 'tab', 'aria-current': p.id === ws.focus ? 'page' : undefined, 'data-tab': p.id });
        b.addEventListener('click', () => this.focus(p.id, true));
        strip.append(b);
      }
      chrome.push(strip);
      const top = visiblePanes.length ? 34 : 0;
      geo = { panes: new Map(), strips: [], handles: [] };
      const show = ws.focus ?? visiblePanes[0]?.id;
      if (show) geo.panes.set(show, { x: 0, y: top, w: area.w, h: area.h - top });
    } else {
      geo = layoutWorkspace(ws, area);
      for (const s of geo.strips) {
        const strip = h('div', { class: `strip ${s.vertical ? 'stacked' : 'tabbed'}`, role: 'tablist', 'aria-label': `${s.vertical ? 'stacked' : 'tabbed'} container` });
        Object.assign(strip.style, px(s.rect));
        s.con.children.forEach((child, i) => {
          const first = treePanes(child)[0];
          if (!first) return;
          const label = treePanes(child).map((p) => APPS[p.app].title).join(' + ');
          const b = button(label, { class: 'tab', role: 'tab', 'aria-selected': String(i === s.con.active), 'data-tab': first.id });
          b.addEventListener('click', () => this.focus(first.id, true));
          strip.append(b);
        });
        // As in i3, a tabbed or stacked pane has no title bar of its own: the tab is its
        // title, and the strip carries the tools for the visible pane.
        const shown = s.con.children[s.con.active];
        if (shown?.kind === 'pane') {
          const tools = h('div', { class: 'tools strip-tools' });
          const def = APPS[shown.app];
          for (const [glyph, label, act] of [
            ['g-tabbed', 'change layout', 'layout'], ['g-float', 'toggle floating', 'float'],
            ['g-fullscreen', 'toggle fullscreen', 'fullscreen'], ['g-scratch', 'send to scratchpad', 'scratch'],
            ['g-move', 'move', 'move'], ['g-close', 'close', 'close'],
          ] as const) {
            const t = button(label, { class: 'tool', 'data-act': act, 'aria-label': `${label} ${def.title}`, title: label }, icon(glyph));
            t.addEventListener('click', () => this.toolAction(shown.id, act, t));
            tools.append(t);
          }
          strip.append(tools);
        }
        chrome.push(strip);
      }
      for (const hd of geo.handles) {
        const el = h('div', { class: `handle ${hd.axis}`, 'aria-hidden': 'true', 'data-handle': `${hd.con.id}:${hd.index}` });
        Object.assign(el.style, px(hd.rect));
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          let last = hd.axis === 'h' ? e.clientX : e.clientY;
          // Rendering replaces this handle, so follow the pointer on the window.
          this.track((ev) => {
            const now = hd.axis === 'h' ? ev.clientX : ev.clientY;
            if (shiftSize(hd.con, hd.index, hd.index + 1, (now - last) / hd.span)) {
              last = now;
              this.render();
            }
          });
        });
        chrome.push(el);
      }
    }
    if (visiblePanes.length === 0) {
      chrome.push(h('p', { class: 'empty-ws' },
        `Workspace ${ws.num} is empty. Open an app from the run button, or press ${MODE_KEY.label} then d.`));
    }
    this.chrome.replaceChildren(...chrome);
    this.geo = geo;

    const wanted = new Set(geo.panes.keys());
    for (const [id, el] of this.paneEls) {
      if (!wanted.has(id)) {
        el.hidden = true;
        el.removeAttribute('data-focused');
      }
    }
    const fresh: HTMLElement[] = [];
    for (const p of visiblePanes) {
      const r = geo.panes.get(p.id);
      if (!r) continue;
      const el = this.paneEl(p);
      if (!el.isConnected) this.work.append(el);
      el.hidden = false;
      Object.assign(el.style, px(r));
      el.classList.toggle('floating', isFloating(ws, p.id) && !phone);
      el.classList.toggle('fullscreen', ws.fullscreen === p.id);
      const lay = parentLayout(ws, p.id);
      el.dataset.layout = lay ?? 'floating';
      const layoutBtn = el.querySelector<HTMLButtonElement>('[data-act="layout"]');
      if (layoutBtn && lay) {
        layoutBtn.replaceChildren(icon(LAYOUT_GLYPH[lay]));
        layoutBtn.title = `layout: ${LAYOUT_WORD[lay]} (click to change)`;
      }
      el.toggleAttribute('data-focused', p.id === ws.focus);
      // Title-bar tools are tab stops only on the focused pane; the binding mode reaches all.
      for (const b of el.querySelectorAll<HTMLButtonElement>('.tool')) b.tabIndex = p.id === ws.focus ? 0 : -1;
      el.toggleAttribute('data-next-split', p.id === ws.focus && ws.nextSplit !== null);
      if (p.id === ws.focus && ws.nextSplit) el.dataset.nextSplit = ws.nextSplit;
      if (!this.placed.has(p.id)) fresh.push(el);
    }
    // Floating panes stack above the tiles, focused floating pane on top.
    for (const f of ws.floating) {
      const el = this.paneEls.get(f.pane.id);
      if (el) el.style.zIndex = f.pane.id === ws.focus ? '6' : '5';
    }
    for (const p of visiblePanes) if (!isFloating(ws, p.id)) {
      const el = this.paneEls.get(p.id);
      if (el) el.style.zIndex = ws.fullscreen === p.id ? '7' : '';
    }
    // A workspace switch moves the whole work area; only panes that appear on the same
    // workspace get the open motion, so the two never stack.
    if (this.lastWs === ws.num) {
      for (const el of fresh) animate(el, [{ opacity: 0, transform: 'scale(0.985)' }, { opacity: 1, transform: 'none' }], 90);
    }
    if (this.lastWs && this.lastWs !== ws.num) {
      const dir = ws.num > this.lastWs ? 1 : -1;
      animate(this.work, [{ opacity: 0.4, transform: `translateX(${12 * dir}px)` }, { opacity: 1, transform: 'none' }], 100);
    }
    this.lastWs = ws.num;
    this.placed = wanted;
    for (const inst of this.instances.values()) inst.resize?.();
  }

  /** FLIP a pane from its old rectangle to its new one. Transform only. */
  private flip(id: string, before: Rect | undefined): void {
    const after = this.geo.panes.get(id);
    const el = this.paneEls.get(id);
    if (!before || !after || !el || !motionOk()) return;
    const sx = before.w / after.w;
    const sy = before.h / after.h;
    const dx = before.x - after.x;
    const dy = before.y - after.y;
    el.style.transformOrigin = '0 0';
    animate(el, [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }], 120);
  }

  /** Apps not open anywhere, for the launcher. */
  closedApps(): AppId[] {
    return APP_IDS.filter((a) => !findApp(this.state, a));
  }
}

function px(r: Rect): Partial<CSSStyleDeclaration> {
  return { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` };
}

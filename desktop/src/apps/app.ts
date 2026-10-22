import type { AppId } from '../wm/tree';

export interface AppInstance {
  el: HTMLElement;
  /** Move keyboard focus to the app's main control. */
  focus(): void;
  /** Redraw after the pane changes size. */
  resize?(): void;
  destroy(): void;
}

export interface AppContext {
  open(app: AppId): void;
}

export interface AppDef {
  id: AppId;
  title: string;
  icon: string;
  summary: string;
  create(ctx: AppContext): AppInstance;
}

/** Keep a canvas sharp at the device pixel ratio and sized to its box. */
export function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const hgt = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== hgt) {
    canvas.width = w;
    canvas.height = hgt;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

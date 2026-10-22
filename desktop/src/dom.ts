// DOM and number helpers shared by the apps.

import sprite from '../design/icons.svg?raw';

type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A glyph from the Glaxnimate sprite. Decorative: the label next to it carries meaning. */
export function icon(id: string, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

/** Put the sprite in the document once so <use> can reach its symbols. */
export function mountSprite(): void {
  const holder = h('div', { class: 'sprite', 'aria-hidden': 'true' });
  holder.innerHTML = sprite;
  document.body.prepend(holder);
}

export function button(label: string, attrs: Attrs = {}, ...children: (Node | string)[]): HTMLButtonElement {
  return h('button', { type: 'button', ...attrs }, ...(children.length ? children : [label]));
}

// ---------- numbers ----------

const MINUS = '−';

export function fixed(v: number, digits: number): string {
  const s = Math.abs(v).toFixed(digits);
  return v < 0 && Number(s) !== 0 ? `${MINUS}${s}` : s;
}

/** Always print the sign: color only repeats it. */
export function signed(v: number, digits: number): string {
  const s = Math.abs(v).toFixed(digits);
  if (Number(s) === 0) return ` ${s}`;
  return `${v < 0 ? MINUS : '+'}${s}`;
}

export const pct = (v: number, digits = 2) => `${fixed(v * 100, digits)}%`;

export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${fixed(v / 1e6, 2)}M`;
  if (a >= 1e4) return `${fixed(v / 1e3, 1)}k`;
  return fixed(v, 2);
}

export function duration(seconds: number): string {
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

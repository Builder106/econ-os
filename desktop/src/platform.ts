// Browser helpers: local storage that never throws, the theme, analytics and motion.

const KEY = 'econos.desktop.v1';

export function load(): unknown {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function save(value: unknown): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage can be full, blocked or absent. The desktop still works without it.
  }
}

// ---------- theme ----------

export type Theme = 'light' | 'dark';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function effectiveTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return media.matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  window.dispatchEvent(new Event('econos-theme'));
}

media.addEventListener('change', () => window.dispatchEvent(new Event('econos-theme')));

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------- analytics ----------

type VaArgs = ['event', { name: string; data?: Record<string, string | number> }];

declare global {
  interface Window {
    va?: (...args: VaArgs) => void;
    vaq?: VaArgs[];
  }
}

/** Vercel's static-site snippet: queue calls until /_vercel/insights/script.js loads. */
export function loadAnalytics(): void {
  window.va = window.va ?? ((...args: VaArgs) => {
    (window.vaq = window.vaq ?? []).push(args);
  });
  const s = document.createElement('script');
  s.defer = true;
  s.src = '/_vercel/insights/script.js';
  document.head.append(s);
}

/** Vercel Analytics custom event. Never sends command arguments. */
export function track(name: string, data?: Record<string, string | number>): void {
  if (typeof window.va === 'function') window.va('event', { name, data });
}

// ---------- motion ----------

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
export const motionOk = (): boolean => !reduced.matches;

/** Transform and opacity only. Under reduced motion nothing runs. */
export function animate(el: Element, frames: Keyframe[], ms: number): void {
  if (!motionOk()) return;
  el.animate(frames, { duration: ms, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

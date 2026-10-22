// Market: wage and price streamed tick by tick, with the macro readouts beside them.
// A hand-drawn canvas line is the smallest route that redraws every 500 ms without a
// charting library; each plot keeps its own scale because wage and price differ.

import { compact, fixed, h, pct } from '../dom';
import { cssVar } from '../platform';
import { session } from '../session';
import { type AppDef, fitCanvas } from './app';

interface Plot {
  canvas: HTMLCanvasElement;
  values: () => number[];
  color: string;
  digits: number;
}

function draw(p: Plot): void {
  const ctx = fitCanvas(p.canvas);
  if (!ctx) return;
  const w = p.canvas.clientWidth;
  const full = p.canvas.clientHeight;
  ctx.clearRect(0, 0, w, full);
  const font = getComputedStyle(p.canvas).fontFamily;
  ctx.font = `11px ${font}`;
  ctx.textBaseline = 'middle';
  const muted = cssVar('--muted');
  const padR = 64;
  const padB = 16;
  const plotW = Math.max(10, w - padR);
  const hh = Math.max(10, full - padB);
  ctx.strokeStyle = cssVar('--line');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(plotW, 0.5);
  ctx.moveTo(0, hh - 0.5);
  ctx.lineTo(plotW, hh - 0.5);
  ctx.moveTo(plotW + 0.5, 0);
  ctx.lineTo(plotW + 0.5, hh);
  ctx.stroke();
  // Up to 240 ticks (two minutes) on screen. The scale comes from what is on screen,
  // so the range labels always name the plotted extremes.
  const view = p.values().slice(-240);
  if (view.length === 0) return;
  const steps = session.steps.slice(-view.length);
  let lo = Math.min(...view);
  let hi = Math.max(...view);
  const flat = hi - lo < 1e-9;
  const pad = flat ? 0.5 : (hi - lo) * 0.1;
  const y = (v: number) => hh - 4 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (hh - 8);
  // A new tab has only the ticks since it joined. They span the plot from the join
  // step, with at least 8 slots so a single jump is not drawn as a cliff.
  const dx = plotW / (Math.max(8, view.length) - 1);
  const x0 = view.length >= 8 ? 0 : plotW - (view.length - 1) * dx;
  grid(ctx, plotW, hh, view.length, dx, x0, steps[0] ?? 0);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  view.forEach((v, i) => (i === 0 ? ctx.moveTo(x0 + i * dx, y(v)) : ctx.lineTo(x0 + i * dx, y(v))));
  ctx.stroke();
  const last = view[view.length - 1];
  const lx = x0 + (view.length - 1) * dx;
  ctx.fillStyle = p.color;
  ctx.fillRect(lx - 2, y(last) - 2, 4, 4);
  const lastY = Math.min(hh - 6, Math.max(6, y(last)));
  ctx.textAlign = 'left';
  ctx.fillText(fixed(last, p.digits), plotW + 6, lastY);
  // Range labels sit at the plotted high and low, and give way to the latest value.
  ctx.fillStyle = muted;
  const lastText = fixed(last, p.digits);
  if (!flat) {
    const hiY = Math.max(6, y(hi));
    const loY = Math.min(hh - 6, y(lo));
    if (Math.abs(hiY - lastY) > 14 && fixed(hi, p.digits) !== lastText) ctx.fillText(fixed(hi, p.digits), plotW + 6, hiY);
    if (Math.abs(loY - lastY) > 14 && fixed(lo, p.digits) !== lastText) ctx.fillText(fixed(lo, p.digits), plotW + 6, loY);
  }
  // Step labels under the plot: where the visible trace starts and ends.
  const first = steps[0];
  const end = steps[steps.length - 1];
  if (first === undefined || end === undefined) return;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const joined = session.joinedAt === first;
  const startText = joined ? `joined at step ${first}` : `step ${first}`;
  const endText = `step ${end}`;
  const startX = Math.max(0, x0);
  const room = plotW - startX - ctx.measureText(startText).width - ctx.measureText(endText).width;
  // Two labels when they fit apart; one merged label when they would overprint.
  if (end === first || room >= 12) {
    ctx.fillText(startText, startX, full - 3);
    ctx.textAlign = 'right';
    if (end !== first) ctx.fillText(endText, plotW, full - 3);
  } else {
    ctx.textAlign = 'right';
    ctx.fillText(`${startText} \u2192 ${end}`, plotW, full - 3);
  }
}

/** Hairline grid at quarter heights and every 20 steps, drawn under the trace. */
function grid(ctx: CanvasRenderingContext2D, w: number, hh: number, count: number, dx: number, x0: number, firstStep: number): void {
  ctx.save();
  ctx.strokeStyle = cssVar('--line');
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const gy = Math.round((hh * i) / 4) + 0.5;
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
  }
  for (let i = 0; i < count; i++) {
    if ((firstStep + i) % 20 !== 0) continue;
    const gx = Math.round(x0 + i * dx) + 0.5;
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, hh);
  }
  ctx.stroke();
  ctx.restore();
}

export const market: AppDef = {
  id: 'market',
  title: 'market',
  icon: 'i-market',
  summary: 'wage and price, live',
  create() {
    const cells: Record<string, HTMLElement> = {};
    const cell = (key: string, label: string, cls = '') => {
      const v = h('dd', { class: `v ${cls}`, 'data-k': key, text: '–' });
      cells[key] = v;
      return h('div', { class: 'cell' }, h('dt', { class: cls ? `${cls} k` : 'k', text: label }), v);
    };
    const wageCanvas = h('canvas', { role: 'img', 'aria-label': 'wage trace' });
    const priceCanvas = h('canvas', { role: 'img', 'aria-label': 'price trace' });
    const span = h('p', { class: 'muted small', 'aria-live': 'off', text: 'waiting for the first tick' });
    const note = h('p', { class: 'note small', hidden: true });
    const el = h(
      'div',
      { class: 'app market', tabindex: -1 },
      h(
        'dl',
        { class: 'readouts' },
        cell('wage', 'wage', 'c-wage'),
        cell('price', 'price', 'c-price'),
        cell('cpi', 'cpi'),
        cell('gdp', 'real gdp'),
        cell('gini', 'gini', 'c-lorenz'),
        cell('money', 'money'),
        cell('treasury', 'treasury', 'c-bronze'),
        cell('tax', 'tax'),
      ),
      h('div', { class: 'plots' },
        h('div', { class: 'plot' }, h('span', { class: 'plot-k c-wage', text: 'wage' }), wageCanvas),
        h('div', { class: 'plot' }, h('span', { class: 'plot-k c-price', text: 'price' }), priceCanvas),
      ),
      span,
      note,
    );
    const plots: Plot[] = [
      { canvas: wageCanvas, values: () => session.wages, color: '', digits: 3 },
      { canvas: priceCanvas, values: () => session.prices, color: '', digits: 3 },
    ];
    const redraw = () => {
      plots[0].color = cssVar('--d-wage');
      plots[1].color = cssVar('--d-price');
      plots.forEach(draw);
    };
    const update = () => {
      const t = session.tick;
      if (!t) return;
      cells.wage.textContent = fixed(t.market.wage, 3);
      cells.price.textContent = fixed(t.market.price, 3);
      cells.cpi.textContent = fixed(t.metrics.cpi, 2);
      cells.gdp.textContent = compact(t.metrics.real_gdp);
      cells.gini.textContent = fixed(t.metrics.gini, 4);
      cells.money.textContent = compact(t.metrics.total_money);
      cells.treasury.textContent = compact(t.metrics.treasury);
      cells.tax.textContent = pct(t.policy.tax_rate);
      const first = session.steps[0];
      const last = session.steps[session.steps.length - 1];
      span.textContent = first === undefined
        ? ''
        : `steps ${first}–${last}, seen by this tab; dotted rules every 20 steps${t.paused ? '. Kernel paused.' : ''}`;
      wageCanvas.setAttribute('aria-label', `wage trace, latest ${fixed(t.market.wage, 3)}`);
      priceCanvas.setAttribute('aria-label', `price trace, latest ${fixed(t.market.price, 3)}`);
      note.hidden = t.policies_loaded;
      note.textContent = 'Trained policies are not loaded: the agents sample random actions.';
      redraw();
    };
    const off = [session.on('tick', update)];
    const onTheme = () => redraw();
    window.addEventListener('econos-theme', onTheme);
    const ro = new ResizeObserver(redraw);
    ro.observe(wageCanvas);
    ro.observe(priceCanvas);
    update();
    return {
      el,
      focus: () => el.focus(),
      resize: redraw,
      destroy() {
        off.forEach((f) => f());
        ro.disconnect();
        window.removeEventListener('econos-theme', onTheme);
      },
    };
  },
};

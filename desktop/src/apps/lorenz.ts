// Lorenz: consumer wealth distribution against the line of equality. The gap between
// them is hatched, the same figure as the EconOS mark, drawn from the live tick.

import { fixed, h, pct } from '../dom';
import { cssVar } from '../platform';
import { session } from '../session';
import { type AppDef, fitCanvas } from './app';

function share(q: number[], c: number[], at: number): number {
  for (let i = 1; i < q.length; i++) {
    if (q[i] >= at) {
      const t = (at - q[i - 1]) / (q[i] - q[i - 1] || 1);
      return c[i - 1] + t * (c[i] - c[i - 1]);
    }
  }
  return c[c.length - 1] ?? 0;
}

export const lorenz: AppDef = {
  id: 'lorenz',
  title: 'lorenz',
  icon: 'i-lorenz',
  summary: 'consumer wealth distribution',
  create() {
    const canvas = h('canvas', { role: 'img', 'aria-label': 'Lorenz curve' });
    const gini = h('dd', { class: 'v big c-lorenz', text: '–' });
    const bottom = h('dd', { class: 'v', text: '–' });
    const top = h('dd', { class: 'v', text: '–' });
    const el = h(
      'div',
      { class: 'app lorenz', tabindex: -1 },
      h('div', { class: 'lorenz-grid' }, h('div', { class: 'lorenz-plot' }, canvas),
      h(
        'dl',
        { class: 'readouts stack' },
        h('div', { class: 'cell' }, h('dt', { class: 'k c-lorenz', text: 'gini' }), gini),
        h('div', { class: 'cell' }, h('dt', { class: 'k', text: 'bottom 50% hold' }), bottom),
        h('div', { class: 'cell' }, h('dt', { class: 'k', text: 'top 20% hold' }), top),
        h('p', { class: 'muted small', text: 'Consumers only, as the kernel computes Gini. The hatched gap is the inequality.' }),
      )),
    );

    const draw = () => {
      const t = session.tick;
      const ctx = fitCanvas(canvas);
      if (!ctx) return;
      const w = canvas.clientWidth;
      const hh = canvas.clientHeight;
      ctx.clearRect(0, 0, w, hh);
      // Leave a row under the square for the axis label.
      // Room for the y ticks on the left and the axis label underneath.
      const s = Math.max(10, Math.min(w - 44, hh - 40));
      const ox = Math.round((w - s + 36) / 2) + 0.5;
      const oy = Math.round((hh - s - 18) / 2) + 8.5;
      const X = (q: number) => ox + q * s;
      const Y = (c: number) => oy + s - c * s;
      ctx.lineWidth = 1;
      ctx.strokeStyle = cssVar('--line');
      ctx.strokeRect(ox, oy, s, s);
      ctx.strokeStyle = cssVar('--d-equal');
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(1), Y(1));
      ctx.stroke();
      const font = getComputedStyle(canvas).fontFamily;
      ctx.font = `11px ${font}`;
      ctx.fillStyle = cssVar('--muted');
      ctx.textBaseline = 'top';
      ctx.fillText('population share →', ox, oy + s + 6);
      // Ticks at 0, 50 and 100% on both axes, and the y-axis name above the square.
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [0, 0.5, 1]) ctx.fillText(`${v * 100}%`, ox - 6, Y(v));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of [0.5, 1]) ctx.fillText(`${v * 100}%`, X(v), oy + s + 6);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('wealth share ↑', ox, oy - 4);
      ctx.textBaseline = 'top';
      if (!t || t.metrics.lorenz_curve.quantiles.length < 2) return;
      const q = t.metrics.lorenz_curve.quantiles;
      const c = t.metrics.lorenz_curve.cumulative_wealth;
      const color = cssVar('--d-lorenz');
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(X(q[0]), Y(c[0]));
      q.forEach((qq, i) => ctx.lineTo(X(qq), Y(c[i])));
      ctx.lineTo(X(0), Y(0));
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (let x = 6; x < s; x += 6) {
        ctx.moveTo(ox + x, oy);
        ctx.lineTo(ox + x, oy + s);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      q.forEach((qq, i) => (i === 0 ? ctx.moveTo(X(qq), Y(c[i])) : ctx.lineTo(X(qq), Y(c[i]))));
      ctx.stroke();
    };

    const update = () => {
      const t = session.tick;
      if (!t) return;
      const q = t.metrics.lorenz_curve.quantiles;
      const c = t.metrics.lorenz_curve.cumulative_wealth;
      gini.textContent = fixed(t.metrics.gini, 4);
      if (q.length >= 2) {
        const b = share(q, c, 0.5);
        const tp = 1 - share(q, c, 0.8);
        bottom.textContent = pct(b, 1);
        top.textContent = pct(tp, 1);
        canvas.setAttribute('aria-label', `Lorenz curve: Gini ${fixed(t.metrics.gini, 4)}, bottom half holds ${pct(b, 1)} of consumer wealth`);
      }
      draw();
    };
    const off = session.on('tick', update);
    window.addEventListener('econos-theme', draw);
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    update();
    return {
      el,
      focus: () => el.focus(),
      resize: draw,
      destroy() {
        off();
        ro.disconnect();
        window.removeEventListener('econos-theme', draw);
      },
    };
  },
};

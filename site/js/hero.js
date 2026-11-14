// Hero: live mini chart with a draggable bid line. Everything is drawn in "% under price",
// so before launch (no price yet) the chart still works and shows no invented numbers.
// Real open bids are drawn as an order-book ladder on the right edge.
import { distanceMult, fillKey, ageMult, spanMinutes } from './rules.js';
import copy, { fill } from './copy.js';
import { reducedMotion, pct as fmtPct, mult as fmtMult, price as fmtPrice, el, sol as fmtSol } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';
const MAX = 45; // the line can go past the 30% edge so people can see it count zero
const STEP = 0.5;
const PAD = 18;
const LADDER = 92; // px reserved on the right for the bid ladder

export function initHero(cfg) {
  const chart = document.getElementById('chart');
  const svg = document.getElementById('chart-svg');
  const line = document.getElementById('bidline');
  const handle = document.getElementById('bid-handle');
  const ro = { box: document.getElementById('readout'), pct: document.getElementById('ro-pct'), mult: document.getElementById('ro-mult'), fill: document.getElementById('ro-fill'), extra: document.getElementById('ro-extra') };

  // What 1 SOL resting at the line earns per round as it ages, from the real age bands.
  const spanLabel = (span) => (/r$/.test(span) ? `${span.slice(0, -1)} round` : /h$/.test(span) ? span : `${span.slice(0, -1)} days`);
  const ages = cfg.ageBands.slice(1).map((_, k) => {
    const i = k + 1;
    const prev = cfg.ageBands[i - 1][0];
    return { label: spanLabel(prev), minutes: spanMinutes(prev, cfg.roundMinutes) + (i === 1 ? 0 : 1) };
  });
  function renderExtra(p, m) {
    const R = copy.readout;
    const rows = ages.map((a) => el('li', {}, [el('span', { text: fill(R.after, { span: a.label }) }), el('b', { text: fill(R.pts, { p: fmtMult(m * ageMult(a.minutes, cfg.ageBands, cfg.roundMinutes)) }) })]));
    const near = [...state.bids].filter((b) => b.distancePct >= 0).sort((a, b) => Math.abs(a.distancePct - p) - Math.abs(b.distancePct - p)).slice(0, 2).sort((a, b) => a.distancePct - b.distancePct);
    ro.extra.replaceChildren(
      el('p', { class: 'ro-k', text: R.earns }),
      el('ul', { class: 'ro-rows' }, rows),
      el('p', { class: 'ro-hint', text: R.hint }),
      el('p', { class: 'ro-k', text: R.nearest }),
      near.length
        ? el('ul', { class: 'ro-rows' }, near.map((b) => el('li', {}, [el('span', { text: fill(R.bid, { x: fmtSol(b.sol), p: fmtPct(b.distancePct, 1) }) }), el('i', { class: b.distancePct < p ? 'up' : 'down', 'aria-hidden': 'true' })])))
        : el('p', { class: 'ro-none', text: R.none }),
    );
  }

  const state = { pct: 4, price: null, history: [], bids: [], w: 0, h: 0, top: -8, key: null, intro: false };
  handle.setAttribute('aria-label', copy.hero.sliderLabel);
  handle.setAttribute('aria-valuemax', String(MAX));

  const yOf = (p) => PAD + ((p - state.top) / (MAX - state.top)) * (state.h - PAD * 2);
  const pOf = (y) => state.top + ((y - PAD) / (state.h - PAD * 2)) * (MAX - state.top);

  function draw() {
    const r = chart.getBoundingClientRect();
    state.w = r.width; state.h = r.height;
    const { w } = state;
    const histPct = state.price ? state.history.map(([, p]) => ((state.price - p) / state.price) * 100) : [];
    state.top = Math.min(-8, ...histPct.map((x) => x - 3));
    svg.setAttribute('viewBox', `0 0 ${w} ${state.h}`);
    svg.replaceChildren();
    const add = (tag, attrs, text, parent = svg) => {
      const n = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text) n.textContent = text;
      parent.append(n);
      return n;
    };

    const defs = add('defs', {});
    const grad = add('linearGradient', { id: 'fp-area', x1: 0, x2: 0, y1: 0, y2: 1 }, null, defs);
    add('stop', { offset: '0%', 'stop-color': '#f2fff7', 'stop-opacity': 0.16 }, null, grad);
    add('stop', { offset: '100%', 'stop-color': '#f2fff7', 'stop-opacity': 0 }, null, grad);

    // Distance bands under the price
    let from = 0;
    const op = [0.2, 0.12, 0.06];
    cfg.distanceBands.forEach(([to, m], i) => {
      add('rect', { class: 'c-zone', x: 0, y: yOf(from), width: w, height: yOf(to) - yOf(from), 'fill-opacity': op[i] ?? 0.05 });
      add('text', { class: 'c-zone-label', x: 12, y: (yOf(from) + yOf(to)) / 2 + 4 }, fill(copy.wall.band, { n: m }));
      from = to;
    });

    // Floor edge and price line
    add('line', { class: 'c-edge', x1: 0, x2: w, y1: yOf(cfg.rangePct), y2: yOf(cfg.rangePct) });
    add('text', { class: 'c-label', x: 44, y: yOf(cfg.rangePct) + 16 }, fill(copy.hero.floorEdge, { range: cfg.rangePct }));
    add('line', { class: 'c-price', x1: 0, x2: w, y1: yOf(0), y2: yOf(0) });
    const priceLabel = add('text', { class: 'c-label', x: 12, y: yOf(0) - 8 }, state.price ? fill(copy.hero.priceNowValue, { x: fmtPrice(state.price) }) : copy.hero.priceNow);

    // Price history (real points only), with a soft area under it
    if (histPct.length >= 2) {
      const t0 = state.history[0][0];
      const t1 = state.history.at(-1)[0];
      const xr = w - LADDER - 8;
      const xOf = (t) => 12 + ((t - t0) / Math.max(1, t1 - t0)) * (xr - 12);
      const pts = state.history.map(([t], i) => [xOf(t), yOf(Math.min(MAX, histPct[i]))]);
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
      const base = Math.max(...pts.map((q) => q[1])) + 36; // a short glow under the line, not a slab over the bands
      const intro = state.intro && !reducedMotion();
      add('path', { class: intro ? 'c-area intro' : 'c-area', d: `${d}L${pts.at(-1)[0].toFixed(1)},${base}L${pts[0][0].toFixed(1)},${base}Z`, fill: 'url(#fp-area)' });
      const path = add('path', { class: intro ? 'c-path intro' : 'c-path', d });
      if (intro) { const len = Math.ceil(path.getTotalLength()); path.style.strokeDasharray = `${len}`; path.style.setProperty('--len', `${len}`); }
      const [lx, ly] = pts.at(-1);
      if (!reducedMotion()) add('circle', { class: 'c-pulse', cx: lx, cy: ly, r: 4 });
      add('circle', { class: 'c-dot', cx: lx, cy: ly, r: 4 });
    }

    // Real open bids as a ladder on the right edge, width by SOL (square-root scale)
    if (state.bids.length) {
      const maxSol = Math.max(...state.bids.map((b) => b.sol));
      add('line', { class: 'c-grid', x1: w - LADDER, x2: w - LADDER, y1: yOf(0), y2: yOf(MAX) });
      const intro = state.intro && !reducedMotion();
      [...state.bids].sort((a, b) => a.distancePct - b.distancePct).forEach((b, i) => {
        if (!(b.distancePct >= 0 && b.distancePct <= MAX)) return;
        const bw = 6 + (LADDER - 12) * Math.sqrt(b.sol / maxSol);
        const cls = `c-bid${b.distancePct <= cfg.rangePct ? '' : ' c-bid-out'}${intro ? ' intro' : ''}`;
        add('rect', { class: cls, style: `--i:${i}`, x: w - bw - 2, y: yOf(b.distancePct) - 2, width: bw, height: 4, rx: 2 });
      });
    }
    svg.append(priceLabel); // drawn last so the price line never crosses it
    state.intro = false;
    place(false);
  }

  function place(animate) {
    line.classList.toggle('ease', animate && !reducedMotion());
    line.style.setProperty('--y', `${yOf(state.pct)}px`);
    const p = state.pct;
    const m = distanceMult(p, cfg.distanceBands);
    const key = fillKey(p, cfg);
    ro.pct.textContent = fill(copy.hero.under, { x: fmtPct(p) });
    ro.mult.textContent = fill(copy.hero.mult, { n: fmtMult(m) });
    ro.fill.textContent = copy.hero.fill[key];
    renderExtra(p, m);
    ro.box.dataset.fill = key;
    handle.setAttribute('aria-valuenow', String(p));
    handle.setAttribute('aria-valuetext', `${fill(copy.hero.under, { x: fmtPct(p) })}. ${fill(copy.hero.mult, { n: fmtMult(m) })}. ${copy.hero.fill[key]}`);
  }

  const setPct = (p, animate) => { state.pct = Math.round(Math.min(MAX, Math.max(0, p)) / STEP) * STEP; place(animate); };

  // Pointer: tap anywhere on the chart to jump, drag the handle (touch-safe) or the chart (mouse).
  let dragging = false;
  const fromEvent = (e) => pOf(e.clientY - chart.getBoundingClientRect().top);
  chart.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const onHandle = e.target === handle || handle.contains(e.target);
    if (e.pointerType === 'mouse' || onHandle) {
      dragging = true;
      chart.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    if (!onHandle) setPct(fromEvent(e), true);
    handle.focus({ preventScroll: true });
  });
  chart.addEventListener('pointermove', (e) => { if (dragging) setPct(fromEvent(e), false); });
  const stop = () => { dragging = false; };
  chart.addEventListener('pointerup', stop);
  chart.addEventListener('pointercancel', stop);

  handle.addEventListener('keydown', (e) => {
    const k = { ArrowUp: -STEP, ArrowRight: -STEP, ArrowDown: STEP, ArrowLeft: STEP, PageUp: -5, PageDown: 5 }[e.key];
    if (k !== undefined) { setPct(state.pct + k, false); e.preventDefault(); }
    else if (e.key === 'Home') { setPct(0, false); e.preventDefault(); }
    else if (e.key === 'End') { setPct(MAX, false); e.preventDefault(); }
  });

  new ResizeObserver(() => draw()).observe(chart);
  draw();

  return {
    /** price: SOL per token; history: [[unixSec, priceSol]] newest last; bids: [{sol, distancePct}]. */
    setData({ price, history, bids, key }) {
      // The intro plays once per data source (first load, or a different coin), never on refresh or resize.
      if (key !== state.key && (history?.length ?? 0) >= 2) { state.intro = true; state.key = key; }
      state.price = price > 0 ? price : null;
      state.history = state.price ? (history ?? []).filter((p) => p[1] > 0) : [];
      state.bids = (bids ?? []).filter((b) => b.sol > 0);
      draw();
    },
  };
}

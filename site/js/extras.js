// The character, the per-bid wall, the big live number, and empty states.
import copy, { fill } from './copy.js';
import { el, $, sol, pct, int, duration, price as fmtPrice, countUp, reducedMotion } from './util.js';
import { wallBands } from './rules.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, kids = []) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of kids) n.append(c);
  return n;
};

/**
 * Floorpad's character: one of the logo's floor bars, with two dot eyes.
 * "hold": arms up, holding the price line. "rest": asleep under it, waiting for a bid.
 * Flat, thick rounded strokes, brand greens. The line uses currentColor so it reads on light and dark.
 */
export function mascot(pose = 'hold', cls = '') {
  const svg = s('svg', { viewBox: '0 0 120 96', class: `mascot mascot-${pose} ${cls}`.trim(), 'aria-hidden': 'true', focusable: 'false' });
  const ink = '#06150d';
  if (pose === 'hold') {
    // A floor bar standing on the floor, arms curved up, holding the price line where it dips.
    svg.append(
      s('path', { d: 'M6 16 Q30 16 38 22 Q60 34 82 22 Q90 16 114 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 6, 'stroke-linecap': 'round', class: 'm-line' }),
      s('path', { d: 'M34 62 Q20 52 34 26', fill: 'none', stroke: 'currentColor', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      s('path', { d: 'M86 62 Q100 52 86 26', fill: 'none', stroke: 'currentColor', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      s('circle', { cx: 35, cy: 24, r: 5, fill: '#22c55e', stroke: 'currentColor', 'stroke-width': 2.5 }),
      s('circle', { cx: 85, cy: 24, r: 5, fill: '#22c55e', stroke: 'currentColor', 'stroke-width': 2.5 }),
      s('rect', { x: 26, y: 52, width: 68, height: 30, rx: 15, fill: '#22c55e', class: 'm-body' }),
      s('circle', { cx: 51, cy: 66, r: 3.8, fill: ink }),
      s('circle', { cx: 69, cy: 66, r: 3.8, fill: ink }),
      s('rect', { x: 14, y: 84, width: 92, height: 6, rx: 3, fill: '#16a34a' }),
    );
  } else {
    svg.append(
      s('path', { d: 'M8 26 L112 26', fill: 'none', stroke: 'currentColor', 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.35 }),
      s('rect', { x: 24, y: 62, width: 72, height: 22, rx: 11, fill: '#22c55e', class: 'm-body m-breathe' }),
      s('path', { d: 'M47 73 h7 M66 73 h7', stroke: ink, 'stroke-width': 3.4, 'stroke-linecap': 'round' }),
      s('path', { d: 'M86 44 h8 l-8 9 h8 M98 34 h6 l-6 7 h6', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.55, class: 'm-z' }),
      s('rect', { x: 16, y: 86, width: 88, height: 5, rx: 2.5, fill: '#16a34a' }),
    );
  }
  return svg;
}

/** An empty state with the sleeping character, used wherever a list has nothing yet. */
export function emptyState(text, tag = 'p') {
  return el(tag === 'li' ? 'li' : 'div', { class: 'empty' }, [mascot('rest'), el('p', { text })]);
}

/* ---------- the big live number ---------- */
let bigCounted = false;
export function renderBigNum(cfg, market) {
  const box = $('#bignum');
  const t = market?.totals;
  box.hidden = !t;
  if (!t) return;
  const v = $('#bn-v');
  const fmt = (x) => fill(copy.bignum.value, { x: sol(x) });
  if (!bigCounted) { bigCounted = true; countUp(v, t.inRangeSol, fmt); } else v.textContent = fmt(t.inRangeSol);
  $('#bn-s').textContent = fill(copy.bignum.sub, { range: cfg.rangePct, n: int(t.floors) });
}

/* ---------- the wall: every open bid as its own bar ---------- */
/**
 * bids: [{sol, distancePct, restingMinutes}]. Bars are stacked under the price line by distance,
 * width by SOL (square-root scale), centred, coloured by band, like the floor in the logo.
 */
export function renderDepth(cfg, bids, priceSol) {
  const box = $('#wallbox');
  const D = copy.depth;
  const MAXP = cfg.rangePct + 6;
  const list = (bids ?? []).filter((b) => b.sol > 0 && b.distancePct >= 0 && b.distancePct <= MAXP).sort((a, b) => a.distancePct - b.distancePct);
  const bands = wallBands(list.map((b) => ({ remainingSol: b.sol, distancePct: b.distancePct })), cfg);
  const H = 300;
  const y = (p) => 22 + (p / MAXP) * (H - 40);

  const plot = el('div', { class: 'dp-plot', style: `height:${H}px` });
  // band stripes and labels
  let from = 0;
  cfg.distanceBands.forEach(([to, m], i) => {
    plot.append(el('div', { class: `dp-zone z${i}`, style: `top:${y(from)}px;height:${y(to) - y(from)}px` }, [el('span', { text: `${m}x` })]));
    from = to;
  });
  plot.append(
    el('div', { class: 'dp-price', style: `top:${y(0)}px` }, [el('span', { text: priceSol ? fill(copy.hero.priceNowValue, { x: fmtPrice(priceSol) }) : copy.wall.priceNow })]),
    el('div', { class: 'dp-edge', style: `top:${y(cfg.rangePct)}px` }, [el('span', { text: fill(copy.wall.floorEdge, { range: cfg.rangePct }) })]),
  );

  const tip = el('p', { class: 'dp-tip', 'aria-live': 'polite', text: list.length ? D.hint : '' });
  const maxSol = Math.max(...list.map((b) => b.sol), 0);
  let lastY = -99;
  list.forEach((b, i) => {
    let top = y(b.distancePct) - 4;
    if (top < lastY + 9) top = lastY + 9; // bids at almost the same price stack instead of overlapping
    lastY = top;
    const w = 6 + 62 * Math.sqrt(b.sol / maxSol);
    const band = b.distancePct <= cfg.distanceBands[0][0] ? 0 : b.distancePct <= (cfg.distanceBands[1]?.[0] ?? Infinity) ? 1 : b.distancePct <= cfg.rangePct ? 2 : 3;
    const text = fill(D.tip, { x: sol(b.sol), p: pct(b.distancePct, 2), d: duration(b.restingMinutes ?? 0) });
    const bar = el('button', { type: 'button', class: `dp-bar b${band}`, style: `top:${top}px;width:${w}%;--i:${i}`, 'aria-label': text });
    const show = () => { tip.textContent = text; };
    bar.addEventListener('mouseenter', show);
    bar.addEventListener('focus', show);
    bar.addEventListener('click', show);
    plot.append(bar);
  });

  const summary = el('div', { class: 'dp-sum' }, bands.map((b) => el('div', { class: 'dp-cell' }, [
    el('p', { class: 'dp-k', text: fill(D.band, { m: b.mult, a: b.from, b: b.to }) }),
    el('p', { class: 'dp-v', text: fill(D.bandSol, { x: sol(b.sol), n: b.count, bids: b.count === 1 ? copy.floors.bid1 : copy.floors.bidN }) }),
  ])));

  const kids = [plot, tip, summary];
  if (!list.length) kids.splice(1, 1, el('div', { class: 'dp-empty' }, [mascot('rest'), el('p', { text: copy.wall.empty })]));
  box.replaceChildren(...kids);
  if (reducedMotion()) box.classList.add('in');
}

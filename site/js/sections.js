import copy, { fill } from './copy.js';
import {
  el, $, sol, pct, mult, int, duration, timeShort, short, isAddress, isSignature, solscanTx, solscanAccount,
  countUp, toast, price as fmtPrice, ago, coinLogo, walletMark,
} from './util.js';
import { workedExample, spanMinutes, splitPot, LAMPORTS_PER_SOL } from './rules.js';
import { mascot, emptyState, renderDepth } from './extras.js';

const T = (k, v) => fill(k, v);

export const jupiterUrl = (ca) => `https://jup.ag/limit/SOL-${encodeURIComponent(ca)}`;

/* ---------- static copy ---------- */
export function bindCopy(cfg) {
  const vars = { ticker: cfg.ticker, range: cfg.rangePct, roundMinutes: cfg.roundMinutes, burnPct: cfg.burnPct };
  for (const n of document.querySelectorAll('[data-copy]')) {
    const v = n.dataset.copy.split('.').reduce((o, k) => o?.[k], copy);
    if (typeof v === 'string') n.textContent = T(v, vars);
  }
  $('#wallet-in').placeholder = copy.checker.placeholder;
  document.title = copy.meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', T(copy.meta.description, vars));
}

/* ---------- hero eyebrow, nav status, buttons ---------- */
export function renderHeroChrome(cfg) {
  const live = !!cfg.contractAddress;
  const status = live ? copy.hero.live : copy.hero.soon;
  const [lead] = T(copy.hero.eyebrow, { ticker: cfg.ticker, status: '\u0000' }).split('\u0000');
  $('#hero-eyebrow').replaceChildren(lead, el('b', { text: status }));
  $('#nav-status').replaceChildren(lead, el('i', { text: status }));
  $('#hero-lead').textContent = T(copy.hero.lead, { ticker: cfg.ticker, roundMinutes: cfg.roundMinutes });
  $('#beats').replaceChildren(...copy.hero.beats.map((b, i) => el('li', { style: `--i:${i}` }, [el('span', { class: 'beat-n', 'aria-hidden': 'true', text: i + 1 }), T(b, { roundMinutes: cfg.roundMinutes })])));

  const bid = $('#btn-bid');
  if (cfg.contractAddress && isAddress(cfg.contractAddress)) { bid.href = jupiterUrl(cfg.contractAddress); bid.hidden = false; }
  const ca = $('#btn-ca');
  if (cfg.contractAddress) {
    ca.hidden = false;
    ca.addEventListener('click', () => copyCa(cfg));
  }
  const buy = $('#btn-buy');
  if (cfg.buyUrl) { buy.href = cfg.buyUrl; buy.hidden = false; }
  // No buttons before launch: drop the empty row instead of leaving a gap.
  $('.hero-foot').hidden = [bid, ca, buy].every((b) => b.hidden);
}

async function copyCa(cfg) {
  try { await navigator.clipboard.writeText(cfg.contractAddress); toast(copy.toasts.copied); } catch { /* clipboard blocked */ }
}

/* ---------- sticky header: CA chip, Buy, X ---------- */
export function renderHeader(cfg) {
  if (cfg.contractAddress) {
    $('#ca-chip').hidden = false;
    $('#ca-short').textContent = short(cfg.contractAddress);
    $('#ca-short').title = cfg.contractAddress;
    $('#ca-copy').addEventListener('click', () => copyCa(cfg));
  }
  if (cfg.buyUrl) { const b = $('#nav-buy'); b.href = cfg.buyUrl; b.hidden = false; }
  if (cfg.xUrl) {
    const x = $('#nav-x'); x.href = cfg.xUrl; x.hidden = false;  }
}

/* ---------- dashboard ---------- */
function kpi(label, valueNode, sub) {
  return el('div', { class: 'kpi' }, [el('dt', { text: label }), el('dd', {}, [valueNode, el('span', { class: 's', text: sub })])]);
}

let counted = false;
export function renderStats(cfg, round, payouts) {
  const pre = !round;
  const soon = $('#dash-soon');
  soon.hidden = !pre;
  $('#stat-grid').hidden = pre;
  if (pre && !soon.firstChild) {
    soon.append(mascot('hold'), el('div', {}, [
      el('p', { class: 'soon-t', text: T(copy.soon.title, { ticker: cfg.ticker }) }),
      el('p', { class: 'soon-b', text: copy.soon.body }),
    ]));
  }
  const paid = payouts ? Number(BigInt(payouts.totalLamports ?? 0)) / LAMPORTS_PER_SOL : 0;
  const blocks = [
    [copy.stats.pot, pre ? 0 : round.potWaitingSol, sol],
    [copy.stats.floor, pre ? 0 : round.floorSol, sol],
    [copy.stats.paid, paid, sol],
    [copy.stats.counted, pre ? 0 : round.counted, int],
  ];
  $('#stat-grid').replaceChildren(...blocks.map(([[label, valueTpl, sub], value, fmt], i) => {
    const isCount = i === 3;
    const v = el('span', { class: 'v' });
    const format = (x) => (pre ? '0' : T(valueTpl, isCount ? { n: fmt(Math.round(x)) } : { x: fmt(x) }));
    if (!counted && !pre) countUp(v, Number(value) || 0, format);
    else v.textContent = format(Number(value) || 0);
    return kpi(label, v, pre ? copy.stats.prelaunchSub : T(sub, { range: cfg.rangePct }));
  }));
  if (!pre) counted = true;

  const roundMs = cfg.roundMinutes * 60_000;
  const stale = $('#stale');
  if (round) {
    const age = Date.now() - Date.parse(round.time);
    stale.hidden = !(age > 3 * roundMs);
    if (!stale.hidden) stale.textContent = T(copy.stats.stale, { minutes: Math.floor(age / 60_000), time: timeShort(round.time) });
  } else stale.hidden = true;
  $('#dryrun').hidden = !(round && round.mode === 'dry-run');

  const pill = $('#mode-pill');
  pill.hidden = !round;
  if (round) {
    const dry = round.mode === 'dry-run';
    pill.textContent = dry ? copy.stats.modeDry : copy.stats.modeLive;
    pill.dataset.mode = dry ? 'dry' : 'live';
  }

  const bar = $('#paybar');
  const pw = cfg.payoutWallet && isAddress(cfg.payoutWallet) ? cfg.payoutWallet : null;
  bar.hidden = !(pw || round);
  const parts = [];
  if (pw) {
    parts.push(el('span', { class: 'pw' }, [
      el('span', { class: 'pw-k', text: copy.stats.payoutWallet }),
      el('span', { class: 'pw-a mono', title: pw }, [walletMark(pw, 16), short(pw)]),
      round?.payoutBalanceSol != null ? el('span', { class: 'pw-bal mono', text: T(copy.stats.payoutBalance, { x: sol(round.payoutBalanceSol) }) }) : null,
      el('a', { href: solscanAccount(pw), target: '_blank', rel: 'noopener', text: copy.stats.explorer }),
    ]));
  }
  if (round) parts.push(el('span', { class: 'updated mono', 'data-ago': round.time, text: T(copy.stats.updated, { ago: ago(round.time, copy.ago) }) }));
  bar.replaceChildren(...parts);
}

/** The "Across Solana right now" row: real numbers from the floors scan. */
export function renderMarketStats(cfg, market) {
  const box = $('#dash-market');
  const t = market?.totals;
  box.classList.toggle('pending', false);
  box.hidden = !t;
  if (!t) return;
  const D = copy.dash;
  const deepest = market.coins?.[0];
  const newest = market.tape?.[0];
  const cells = [
    kpi(D.resting[0], el('span', { class: 'v', text: T(D.resting[1], { x: sol(t.inRangeSol) }) }), T(D.resting[2], { range: cfg.rangePct, n: int(t.floors) })),
    kpi(D.orders[0], el('span', { class: 'v', text: T(D.orders[1], { n: int(t.orders) }) }), D.orders[2]),
  ];
  if (deepest) {
    cells.push(kpi(D.biggest[0], el('span', { class: 'v' }, [coinLogo([deepest.logo, deepest.image], deepest.symbol, 22), T(D.biggest[1], { symbol: `$${deepest.symbol}` })]), T(D.biggest[2], { x: sol(deepest.inRangeSol), range: cfg.rangePct })));
  }
  if (newest) {
    cells.push(kpi(D.newest[0], el('span', { class: 'v', 'data-ago': String(newest.createdAt), 'data-ago-bare': '1', text: ago(newest.createdAt, copy.ago) }), T(D.newest[2], { x: sol(newest.sol), symbol: `$${newest.symbol}` })));
  }
  $('#market-grid').replaceChildren(...cells);
}

/** Refresh every "… ago" label on the page without re-rendering. */
export function tickAgo() {
  for (const n of document.querySelectorAll('[data-ago]')) {
    const tpl = n.dataset.agoTpl ? n.dataset.agoTpl.split('.').reduce((o, k) => o?.[k], copy) : copy.stats.updated;
    const raw = n.dataset.ago;
    const t = /^\d+$/.test(raw) ? Number(raw) : raw;
    n.textContent = n.dataset.agoBare ? ago(t, copy.ago) : T(tpl, { ago: ago(t, copy.ago) });
  }
}

export function tickTimer(cfg, round) {
  const box = $('#dash-timer');
  // No round yet means no payout is scheduled: do not show a countdown to nothing.
  box.hidden = !round;
  if (!round) return;
  const roundMs = cfg.roundMinutes * 60_000;
  const next = Date.parse(round.nextAt);
  const left = Math.max(0, Number.isFinite(next) ? next - Date.now() : 0);
  const s = Math.ceil(left / 1000);
  $('#timer-text').textContent = T(copy.stats.timer, { mmss: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` });
  $('#timer-fill').style.width = `${Math.min(100, Math.max(0, (1 - left / roundMs) * 100))}%`;
}

/* ---------- how to bid ---------- */
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, kids = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of kids) n.append(c);
  return n;
}
/**
 * One small picture per step. Each plays once when it scrolls into view, then rests:
 * 1. the bid line settles under the price; 2. it steps up from 1x to 3x; 3. three payouts land on it.
 */
function stepArt(i, cfg) {
  const svg = svgEl('svg', { viewBox: '0 0 240 120', class: 'art', 'aria-hidden': 'true', focusable: 'false' });
  const priceLine = svgEl('line', { x1: 12, x2: 228, y1: 30, y2: 30, class: 'a-price' });
  if (i === 0) {
    svg.append(priceLine,
      svgEl('rect', { x: 12, y: 70, width: 216, height: 4, rx: 2, class: 'a-ghost' }),
      svgEl('rect', { x: 12, y: 86, width: 216, height: 4, rx: 2, class: 'a-ghost' }),
      svgEl('g', { class: 'settle' }, [
        svgEl('rect', { x: 12, y: 50, width: 216, height: 5, rx: 2.5, class: 'a-bid' }),
        svgEl('circle', { cx: 208, cy: 52.5, r: 8, class: 'a-knob' }),
      ]));
  } else if (i === 1) {
    let from = 0;
    const op = [0.26, 0.15, 0.07];
    const k = 2.6;
    cfg.distanceBands.forEach(([to, m], j) => {
      svg.append(svgEl('rect', { x: 12, y: 30 + from * k, width: 216, height: (to - from) * k, class: 'a-zone', 'fill-opacity': op[j] ?? 0.06 }));
      const t = svgEl('text', { x: 20, y: 30 + ((from + to) / 2) * k + 4, class: 'a-label' });
      t.textContent = `${m}x`;
      svg.append(t);
      from = to;
    });
    svg.append(priceLine, svgEl('rect', { x: 52, y: 36, width: 176, height: 5, rx: 2.5, class: 'a-bid hop' }));
  } else {
    svg.append(
      svgEl('rect', { x: 12, y: 88, width: 216, height: 12, rx: 6, class: 'a-glow' }),
      svgEl('rect', { x: 12, y: 92, width: 216, height: 5, rx: 2.5, class: 'a-bid' }),
      ...[64, 120, 176].map((cx, j) => svgEl('circle', { cx, cy: 78, r: 8, class: 'a-coin fall', style: `--i:${j}` })),
    );
  }
  return svg;
}
export function renderSteps(cfg) {
  const bandsHint = cfg.distanceBands.map(([to, m], i, a) => `${i ? a[i - 1][0] : 0}–${to}% ${m}x`).join(' · ');
  $('#steps').replaceChildren(...copy.how.steps.map(([h, p], i) => el('li', {}, [
    stepArt(i, cfg),
    el('p', { class: 'step-hint', text: T(copy.hints[i], { bands: bandsHint, roundMinutes: cfg.roundMinutes }) }),
    el('h3', { text: h }),
    el('p', { text: T(p, { ticker: cfg.ticker, roundMinutes: cfg.roundMinutes }) }),
  ])));
}

/* ---------- latest bids tape ---------- */
const seenTape = new Set();
export function renderTape(market) {
  const list = $('#tape-list');
  const rows = market?.tape ?? [];
  if (!rows.length) { list.replaceChildren(emptyState(copy.tape.empty, 'li')); return; }
  const first = seenTape.size === 0;
  list.replaceChildren(...rows.map((t) => {
    const sym = t.symbol ? `$${t.symbol}` : short(t.mint);
    const where = t.distancePct == null ? '' : t.distancePct < 0 ? copy.tape.above : T(copy.tape.under, { p: pct(t.distancePct, 1) });
    const fresh = !first && !seenTape.has(t.order);
    seenTape.add(t.order);
    return el('li', { class: fresh ? 'tape-row new' : 'tape-row' }, [
      coinLogo([t.logo, t.image], t.symbol, 34),
      el('span', { class: 'tape-main', text: T(copy.tape.row, { x: sol(t.sol), symbol: sym }) }),
      el('span', { class: 'tape-sub', text: where }),
      el('span', { class: 'tape-ago', 'data-ago': String(t.createdAt), 'data-ago-bare': '1', text: ago(t.createdAt, copy.ago) }),
    ]);
  }));
}

/* ---------- floors on Solana ---------- */
function sparkline(points) {
  const svg = svgEl('svg', { viewBox: '0 0 120 36', class: 'spark', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' });
  if (!points || points.length < 2) return svg;
  const t0 = points[0][0], t1 = points.at(-1)[0];
  const vs = points.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const y = (v) => 33 - ((v - lo) / Math.max(hi - lo, hi * 1e-9)) * 30;
  const d = points.map(([t, v], i) => `${i ? 'L' : 'M'}${(((t - t0) / Math.max(1, t1 - t0)) * 118 + 1).toFixed(1)},${y(v).toFixed(1)}`).join('');
  svg.append(svgEl('path', { d, class: vs.at(-1) >= vs[0] ? 'spark-line up' : 'spark-line' }));
  return svg;
}
function miniWall(bands) {
  const max = Math.max(...bands.map((b) => b.sol), 0);
  return el('div', { class: 'miniwall', 'aria-hidden': 'true' }, bands.map((b, i) => el('span', { class: 'mw-band', 'data-mult': b.mult, style: `flex:${b.to - b.from} 1 0;--i:${i}` }, [
    el('i', { style: `height:${max > 0 && b.sol > 0 ? Math.max(8, (b.sol / max) * 100) : 0}%` }),
  ])));
}
/** Individual bids as ticks along 0..range%, height by SOL. Shown on hover or focus. */
function bidLadder(bids, cfg) {
  const list = (bids ?? []).filter((b) => b.distancePct >= 0 && b.distancePct <= cfg.rangePct);
  const max = Math.max(...list.map((b) => b.sol), 0);
  return el('div', { class: 'fl-ladder', 'aria-hidden': 'true' }, list.map((b) => el('i', { style: `left:${(b.distancePct / cfg.rangePct) * 100}%;height:${max ? 20 + 80 * Math.sqrt(b.sol / max) : 0}%` })));
}

export function renderFloors(cfg, market, previewMint, onPreview) {
  const list = $('#floors-list');
  const coins = market?.coins ?? [];
  const t = market?.totals;
  $('#floors-totals').textContent = t ? T(copy.floors.totals, { x: sol(t.inRangeSol), range: cfg.rangePct, floors: int(t.floors), orders: int(t.orders) }) : '';
  const foot = $('#floors-foot');
  if (market) { foot.dataset.ago = market.time; foot.dataset.agoTpl = 'floors.updated'; foot.textContent = T(copy.floors.updated, { ago: ago(market.time, copy.ago) }); }
  const more = $('#floors-more');
  more.hidden = coins.length <= 6 || list.classList.contains('all');
  more.textContent = T(copy.floors.more, { n: coins.length });
  more.onclick = () => { list.classList.add('all'); more.hidden = true; };
  if (!coins.length) { list.replaceChildren(emptyState(copy.floors.empty, 'li')); return; }
  list.replaceChildren(...coins.map((c, i) => {
    const sym = `$${c.symbol || short(c.mint)}`;
    const on = c.mint === previewMint;
    const btn = c.spark ? el('button', { type: 'button', class: `fl-show${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', text: on ? copy.floors.previewing : copy.floors.preview }) : null;
    btn?.addEventListener('click', () => onPreview(c.mint));
    return el('li', { class: `floor${on ? ' on' : ''}` }, [
      el('div', { class: 'fl-top' }, [
        el('span', { class: 'fl-logo' }, [coinLogo([c.logo, c.image], c.symbol, 38), el('span', { class: 'fl-rank', text: i + 1 })]),
        el('span', { class: 'fl-name' }, [el('b', { text: sym }), el('span', { class: 'fl-price', text: T(copy.floors.price, { x: fmtPrice(c.priceSol) }) })]),
        sparkline(c.spark),
      ]),
      el('div', { class: 'fl-depth' }, [miniWall(c.bands), bidLadder(c.bids, cfg)]),
      el('p', { class: 'fl-sol', text: T(copy.floors.within, { x: sol(c.inRangeSol), range: cfg.rangePct }) }),
      el('p', { class: 'fl-meta' }, [
        el('span', { text: T(copy.floors.bids, { n: c.inRangeBids, w: c.wallets, bids: c.inRangeBids === 1 ? copy.floors.bid1 : copy.floors.bidN, wallets: c.wallets === 1 ? copy.floors.wallet1 : copy.floors.walletN }) }),
        el('span', { text: T(copy.floors.nearest, { p: pct(c.nearestPct, 1) }) }),
      ]),
      btn,
    ]);
  }));
}

/* ---------- preview notes (labelled real data from another coin) ---------- */
function previewNote(id, tpl, cfg, preview) {
  const n = $(id);
  n.hidden = !preview;
  if (preview) {
    n.replaceChildren(coinLogo([preview.logo, preview.image], preview.symbol, 20), T(tpl, { symbol: `$${preview.symbol}`, ticker: cfg.ticker }));
    n.title = `${preview.name || preview.symbol}: real open bids on that coin`;
  }
}

/* ---------- latest payout card ---------- */
function renderLatest(list, preview, split) {
  const box = $('#latest-payout');
  const L = copy.latest;
  const r = list[0];
  if (r) {
    const sigs = (r.signatures ?? []).filter(isSignature);
    const n = r.bidsPaid ?? 0;
    box.replaceChildren(
      el('div', { class: 'lt-main' }, [
        el('p', { class: 'lt-k', text: L.heading }),
        el('p', { class: 'lt-v', text: T(L.sent, { x: sol(r.potSol ?? 0), n: int(n), bids: n === 1 ? L.bid1 : L.bidN }) }),
        el('p', { class: 'lt-s', text: T(L.round, { r: r.round, ago: ago(r.time, copy.ago) }) }),
      ]),
      sigs[0] ? el('a', { class: 'btn btn-line btn-sm', href: solscanTx(sigs[0]), target: '_blank', rel: 'noopener', text: copy.payouts.link }) : null,
    );
    box.hidden = false;
    return;
  }
  if (!split || !split.rows.length) { box.hidden = true; return; }
  const n = split.rows.length;
  const top = split.rows[0];
  box.replaceChildren(
    el('div', { class: 'lt-main' }, [
      el('p', { class: 'lt-k', text: L.example }),
      el('p', { class: 'lt-v', text: T(L.sent, { x: '1', n: int(n), bids: n === 1 ? L.wallet1 : L.walletN }) }),
      el('p', { class: 'lt-s', text: T(L.exampleSub, { symbol: `$${preview.symbol}` }) }),
    ]),
    el('div', { class: 'lt-top' }, [el('p', { class: 'lt-k', text: L.top }), el('p', { class: 'lt-w' }, [walletMark(top.w), short(top.w), el('b', { text: `${sol(top.got)} SOL` })])]),
    el('div', { class: 'lt-bar', 'aria-hidden': 'true' }, split.rows.map((x) => el('i', { style: `flex:${Math.max(0.5, x.share)} 1 0` }))),
  );
  box.hidden = false;
}

/* ---------- the wall ---------- */
export function renderWall(cfg, round, preview) {
  const usePreview = !round?.bids?.length && preview;
  previewNote('#wall-preview', copy.preview.wall, cfg, usePreview ? preview : null);
  const bids = usePreview ? preview.bids : (round?.bids ?? []);
  renderDepth(cfg, bids, usePreview ? preview.priceSol : round?.price?.sol);
}

/* ---------- formula ---------- */
function distanceLine(cfg) {
  let from = 0;
  const parts = cfg.distanceBands.map(([to, m], i) => { const s = i === 0 ? `${from}-${to}% under price: ${m}x` : `${from}-${to}%: ${m}x`; from = to; return s; });
  return [...parts, 'further: 0x'].join(' · ');
}
function ageLine(cfg) {
  const label = (span) => {
    const m = spanMinutes(span, cfg.roundMinutes);
    if (/r$/.test(span)) return Number(span.slice(0, -1)) === 1 ? 'first full round' : `first ${span.slice(0, -1)} full rounds`;
    return m % 1440 === 0 && m >= 2880 ? `${m / 1440} days` : `${m / 60}h`;
  };
  const out = [];
  let prev = null;
  for (const [span, m] of cfg.ageBands) {
    if (span === null) out.push(`over ${prev === null ? '0' : label(prev)}: ${m}x`);
    else if (/r$/.test(span)) out.push(`${label(span)}: ${m}x`);
    else if (prev === null || /r$/.test(prev)) out.push(`up to ${label(span)}: ${m}x`);
    else out.push(`${label(prev)} to ${label(span)}: ${m}x`);
    prev = span;
  }
  return out.join(' · ');
}
export function renderFormula(cfg) {
  $('#formula-line').replaceChildren(...copy.formula.line.map((t, i) => (t === '=' || t === '×' ? el('span', { class: 'op', text: t }) : el('span', { class: i === 0 ? 'tok lead' : 'tok', text: t }))));
  $('#mults').replaceChildren(
    el('dt', { text: copy.formula.distanceLabel }), el('dd', { text: distanceLine(cfg) }),
    el('dt', { text: copy.formula.ageLabel }), el('dd', { text: ageLine(cfg) }),
  );
  const w = workedExample(cfg);
  $('#example').textContent = T(copy.formula.example, {
    aSol: w.a.sol, aPct: w.a.pct, aDm: mult(w.a.dm), aAm: mult(w.a.am), aPts: mult(w.a.points),
    bSol: w.b.sol, bPct: w.b.pct, bDm: mult(w.b.dm), bAm: mult(w.b.am), bPts: mult(w.b.points),
    total: mult(w.total),
  });
}

/* ---------- launchpad ---------- */
export function renderLaunchpad(cfg) {
  const sec = $('#launchpad');
  if (!cfg.launchpadUrl) { sec.hidden = true; $('#nav-launchpad').hidden = true; return; }
  $('#nav-launchpad').hidden = false;
  sec.hidden = false;
  const L = copy.launchpad;
  if (cfg.launchpadLive) {
    sec.replaceChildren(
      el('div', {}, [el('h2', { text: L.liveTitle }), el('p', { text: T(L.liveBody, { burnPct: cfg.burnPct, ticker: cfg.ticker }) })]),
      el('a', { class: 'btn btn-primary', href: cfg.launchpadUrl, target: '_blank', rel: 'noopener', text: L.liveButton }),
    );
  } else {
    sec.replaceChildren(el('div', {}, [el('h2', { text: L.soonTitle }), el('p', { text: L.soonBody })]));
  }
}

/* ---------- tables ---------- */
function walletCell(w) {
  return el('td', {}, w ? [walletMark(w), el('a', { href: solscanAccount(w), target: '_blank', rel: 'noopener', title: w, text: short(w) })] : ['']);
}
function shareCell(p) {
  return el('td', { class: p > 0 ? null : 'zero' }, [`${pct(p, 2)}%`, el('span', { class: 'share-bar', 'aria-hidden': 'true' }, [el('i', { style: `width:${Math.min(100, p)}%` })])]);
}
function table(cols, rows) {
  return el('table', {}, [
    el('thead', {}, [el('tr', {}, cols.map((c) => el('th', { scope: 'col', text: c })))]),
    el('tbody', {}, rows),
  ]);
}

/** Preview rows: a real coin's real bids, with shares computed the Floorpad way. */
function previewRows(preview) {
  const bids = preview?.bids ?? [];
  const total = bids.reduce((a, b) => a + (b.points || 0), 0);
  return bids.map((b) => ({ ...b, sharePct: total > 0 ? (b.points / total) * 100 : 0 }));
}

/* ---------- bidders ---------- */
export function renderBidders(cfg, round, payouts, highlight, query = '', preview = null) {
  const box = $('#bidders-box');
  const own = round?.bids ?? [];
  const usePreview = !own.length && preview;
  previewNote('#bidders-preview', copy.preview.bidders, cfg, usePreview ? preview : null);
  const all = usePreview ? previewRows(preview) : own;
  const q = query.trim().toLowerCase();
  const bids = q ? all.filter((b) => String(b.wallet).toLowerCase().includes(q)) : all;
  if (!all.length) {
    box.replaceChildren(emptyState(copy.bidders.empty));
  } else if (!bids.length) {
    box.replaceChildren(emptyState(copy.bidders.noMatch));
  } else {
    const paidBy = usePreview ? {} : (payouts?.byWallet ?? {});
    const seen = new Set();
    const rows = bids.map((b) => {
      const i = all.indexOf(b);
      const w = isAddress(b.wallet) ? b.wallet : '';
      // "Paid" is per wallet: show it on the wallet's first (highest-scoring) row only.
      const first = w && !seen.has(w);
      if (w) seen.add(w);
      const paid = first && paidBy[w] ? Number(BigInt(paidBy[w])) / LAMPORTS_PER_SOL : 0;
      return el('tr', { class: w && w === highlight ? 'me' : null }, [
        el('td', { class: 'rank', text: i + 1 }),
        walletCell(w),
        el('td', { text: `${sol(b.sol)} SOL` }),
        el('td', { text: `${pct(b.distancePct, 2)}%` }),
        el('td', { text: duration(b.restingMinutes) }),
        el('td', { class: b.mult > 0 ? null : 'zero' }, [`${mult(b.mult)}x`, el('span', { class: 'sub', text: `${mult(b.distanceMult)} × ${mult(b.ageMult)}` })]),
        shareCell(b.sharePct),
        el('td', { class: paid ? null : 'zero', text: usePreview ? '' : paid ? `${sol(paid)} SOL` : first || !w ? '0' : '' }),
      ]);
    });
    box.replaceChildren(table(copy.bidders.cols, rows));
  }
  const foot = $('#bidders-foot');
  delete foot.dataset.ago;
  if (round && own.length) foot.textContent = T(copy.bidders.footer, { time: timeShort(round.time), n: round.round });
  else if (usePreview) { foot.dataset.ago = preview.time; foot.dataset.agoTpl = 'floors.updated'; foot.textContent = T(copy.floors.updated, { ago: ago(preview.time, copy.ago) }); }
  else foot.textContent = round ? T(copy.bidders.footer, { time: timeShort(round.time), n: round.round }) : '';
}

/* ---------- payouts ---------- */
export function renderPayouts(cfg, round, payouts, preview = null) {
  const box = $('#payouts-box');
  const list = payouts?.rounds ?? [];
  const usePreview = !list.length && preview && preview.bids?.some((b) => b.points > 0);
  previewNote('#payouts-preview', copy.preview.payouts, cfg, usePreview ? preview : null);
  if (list.length) {
    const rows = list.slice(0, 500).map((r) => {
      const sigs = (r.signatures ?? []).filter(isSignature);
      const links = sigs.map((s, i) => el('a', { class: 'tx', href: solscanTx(s), target: '_blank', rel: 'noopener', 'aria-label': sigs.length > 1 ? `${copy.payouts.link} ${i + 1}/${sigs.length}` : copy.payouts.link, text: sigs.length > 1 ? `${copy.payouts.link} ${i + 1}` : copy.payouts.link }));
      return el('tr', {}, [
        el('td', { class: 'rank', text: r.round }),
        el('td', {}, [timeShort(r.time), el('span', { class: 'sub', 'data-ago': r.time, 'data-ago-bare': '1', text: ago(r.time, copy.ago) })]),
        el('td', { text: r.potSol == null ? '' : `${sol(r.potSol)} SOL` }),
        el('td', { text: r.bidsPaid == null ? '' : int(r.bidsPaid) }),
        el('td', {}, links),
      ]);
    });
    box.replaceChildren(table(copy.payouts.cols, rows));
    renderLatest(list, null, null);
  } else if (usePreview) {
    // Example only: the real split function, a 1 SOL pot, this coin's real bids. Nothing is sent.
    const threshold = BigInt(Math.round(cfg.sendThresholdSol * LAMPORTS_PER_SOL));
    const split = splitPot(BigInt(LAMPORTS_PER_SOL), preview.bids.map((b) => ({ wallet: b.wallet, points: b.points })), null, threshold);
    const ptsBy = new Map();
    for (const b of preview.bids) ptsBy.set(b.wallet, (ptsBy.get(b.wallet) ?? 0) + (b.points || 0));
    const total = [...ptsBy.values()].reduce((a, b) => a + b, 0);
    const ranked = [...ptsBy.entries()].filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]);
    renderLatest(list, preview, { rows: ranked.map(([w, p]) => ({ w, share: total > 0 ? (p / total) * 100 : 0, got: Number(split.sharesByWallet[w] ?? 0n) / LAMPORTS_PER_SOL })) });
    const rows = ranked.map(([w, p], i) => {
      const got = split.sharesByWallet[w] ?? 0n;
      return el('tr', {}, [
        el('td', { class: 'rank', text: i + 1 }),
        walletCell(isAddress(w) ? w : ''),
        el('td', { text: mult(p) }),
        shareCell(total > 0 ? (p / total) * 100 : 0),
        el('td', { text: `${sol(Number(got) / LAMPORTS_PER_SOL)} SOL` }),
      ]);
    });
    box.replaceChildren(table(copy.preview.cols, rows));
  } else {
    box.replaceChildren(emptyState(copy.payouts.empty));
    renderLatest(list, null, null);
  }
  $('#payouts-foot').textContent = round && list.length ? T(copy.bidders.footer, { time: timeShort(round.time), n: round.round }) : '';
}

/* ---------- rules + footer ---------- */
export function renderRules(cfg) {
  $('#rules-list').replaceChildren(...copy.rules.items.map((r) => el('li', { text: T(r, { ticker: cfg.ticker, range: cfg.rangePct }) })));
}

export function renderFooter(cfg) {
  const L = copy.footer.links;
  const links = [
    [L.x, cfg.xUrl],
    [L.jupiter, cfg.contractAddress && isAddress(cfg.contractAddress) ? jupiterUrl(cfg.contractAddress) : ''],
    [L.payout, cfg.payoutWallet && isAddress(cfg.payoutWallet) ? solscanAccount(cfg.payoutWallet) : ''],
  ].filter(([, href]) => href);
  $('#foot-links').replaceChildren(...links.map(([t, href]) => el('li', {}, [el('a', { href, target: '_blank', rel: 'noopener', text: t })])));
}

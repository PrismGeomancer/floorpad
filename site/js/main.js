import cfg from '../config.js';
import copy, { fill } from './copy.js';
import { $, toast, sol, coinLogo, reducedMotion } from './util.js';
import { loadData, loadMarket, livePrice } from './data.js';
import { initHero } from './hero.js';
import { initChecker } from './checker.js';
import { renderBigNum, mascot } from './extras.js';
import {
  bindCopy, renderHeroChrome, renderHeader, renderStats, renderMarketStats, tickTimer, tickAgo, renderSteps, renderWall,
  renderFormula, renderLaunchpad, renderBidders, renderPayouts, renderRules, renderFooter, renderTape, renderFloors,
} from './sections.js';

const loader = $('#loader');
const hideLoader = () => { loader.classList.add('gone'); setTimeout(() => { loader.hidden = true; }, 300); };
setTimeout(hideLoader, 900); // the loader never stays longer than a second
// Show the page once its fonts are in (or at the same 0.9 s cap), so nothing reflows on screen.
Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 900))]).then(() => document.documentElement.classList.toggle('loading', false));

bindCopy(cfg);
renderHeroChrome(cfg);
renderHeader(cfg);
renderSteps(cfg);
renderFormula(cfg);
renderLaunchpad(cfg);
renderRules(cfg);
renderFooter(cfg);
const hero = initHero(cfg);
$('#foot-mascot').append(mascot('hold'));

let data = { round: null, payouts: null, error: null, fromCache: false };
let market = null;
let live = null;
let highlight = null;
let query = '';
let previewMint = null; // a coin picked from "Floors on Solana"
let loaded = false; // true after the first data load

/**
 * Before $FLOOR has a price, the page previews a real coin from the floors scan.
 * Every section that uses it says so. Gives null once $FLOOR is live.
 */
function preview() {
  if (live?.price || data.round?.price?.sol) return null;
  const coins = market?.coins ?? [];
  const c = coins.find((x) => x.mint === previewMint && x.spark)
    ?? coins.find((x) => x.mint === market?.featured && x.spark)
    ?? coins.find((x) => x.spark);
  return c ? { ...c, time: market.time } : null;
}

function renderHero() {
  const own = live?.price ?? data.round?.price?.sol ?? null;
  const p = preview();
  if (own) {
    const history = [...(data.round?.history ?? [])];
    if (live?.price) {
      if (history.length < 2) history.splice(0, history.length, ...live.anchors);
      else history.push([Date.now() / 1000, live.price]);
    }
    hero.setData({ price: own, history, bids: (data.round?.bids ?? []).map((b) => ({ sol: b.sol, distancePct: b.distancePct })), key: 'self' });
  } else if (p) {
    hero.setData({ price: p.priceSol, history: p.spark, bids: p.bids ?? [], key: p.mint });
  } else {
    hero.setData({ price: null, history: [], bids: [], key: null });
  }
  // Space for the note and legend is reserved from first paint; it only collapses once the data says so.
  const note = $('#hero-preview');
  const legend = $('#chart-legend');
  const hasBids = (own && data.round?.bids?.length) || (!own && p?.bids?.length);
  if (p && !own) {
    note.replaceChildren(coinLogo([p.logo, p.image], p.symbol, 24), fill(copy.hero.preview, { symbol: `$${p.symbol}`, ticker: cfg.ticker }));
    note.classList.toggle('pending', false);
    note.hidden = false;
  } else if (loaded) note.hidden = true;
  if (hasBids) { legend.classList.toggle('pending', false); legend.hidden = false; } else if (loaded) legend.hidden = true;
}

function renderAll() {
  const { round, payouts } = data;
  const p = preview();
  renderStats(cfg, round, payouts);
  renderMarketStats(cfg, market);
  renderBigNum(cfg, market);
  renderWall(cfg, round, p);
  renderBidders(cfg, round, payouts, highlight, query, p);
  renderPayouts(cfg, round, payouts, p);
  renderTape(market);
  renderFloors(cfg, market, p?.mint ?? null, (mint) => {
    previewMint = mint;
    renderAll();
    $('#chart').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  });
  tickTimer(cfg, round);
  renderHero();
  observeReveals();
}

async function refresh() {
  const prev = data.round;
  const [next, m] = await Promise.all([loadData(), loadMarket()]);
  if (next.error) toast(copy.toasts.unreachable);
  data = next;
  if (m) market = m;
  loaded = true;
  if (prev && data.round && data.round.round !== prev.round && data.round.mode === 'live' && data.round.payouts?.length) {
    const total = data.round.payouts.reduce((a, x) => a + x.sol, 0);
    toast(fill(copy.toasts.newRound, { x: sol(total), n: data.round.payouts.length }));
  }
  renderAll();
}

async function refreshPrice() {
  const p = await livePrice(cfg.contractAddress);
  if (p) { live = p; renderHero(); }
}

/* Things that animate do it once, when they first scroll into view. */
const revealed = new WeakSet();
const io = 'IntersectionObserver' in window && !reducedMotion()
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      e.target.closest('section')?.classList.add('in-seen');
      revealed.add(e.target);
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px' })
  : null;
function observeReveals() {
  for (const n of document.querySelectorAll('.steps li, .depth, .floor, .bignum')) {
    if (revealed.has(n) || n.classList.contains('in')) continue;
    // Cards re-rendered by a refresh, in a section already seen, show at once without replaying.
    if (!io || n.closest('.in-seen')) { n.classList.add('in'); continue; }
    io.observe(n);
  }
}

/* Nav: a hairline once the page scrolls, and the current section marked. */
const nav = $('#nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
if ('IntersectionObserver' in window) {
  const links = new Map([...document.querySelectorAll('#nav-links a')].map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of links.values()) a.classList.remove('active');
      links.get(e.target.id)?.classList.add('active');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (const id of links.keys()) { const s = document.getElementById(id); if (s) spy.observe(s); }
}

initChecker(cfg, () => data, refresh, (w) => { highlight = w; renderBidders(cfg, data.round, data.payouts, highlight, query, preview()); });

const find = $('#find');
find.placeholder = copy.bidders.find;
find.addEventListener('input', () => { query = find.value; renderBidders(cfg, data.round, data.payouts, highlight, query, preview()); });

await Promise.all([refresh(), refreshPrice()]);
hideLoader();
setInterval(() => { tickTimer(cfg, data.round); tickAgo(); }, 1000);
setInterval(refresh, 15_000);
if (cfg.contractAddress) setInterval(refreshPrice, 30_000);

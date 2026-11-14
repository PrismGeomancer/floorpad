// The site reads only data/*.json (written by the keeper) and DexScreener.
import { store } from './util.js';

const WSOL = 'So11111111111111111111111111111111111111112';

async function getJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return { value: await res.json() };
}

/**
 * Result: { round, payouts, error, fromCache }.
 * round null = pre-launch (no round written yet). On a network error the last
 * good copy from this browser is used and `error` is set.
 */
export async function loadData() {
  try {
    const [r, p] = await Promise.all([getJson('./data/round.json'), getJson('./data/payouts.json')]);
    const round = r.missing || r.value?.mode === 'prelaunch' ? null : r.value;
    const out = { round, payouts: p.missing ? null : p.value, error: null, fromCache: false };
    if (out.round) store.set('floorpad:last', { round: out.round, payouts: out.payouts });
    return out;
  } catch (e) {
    const last = store.get('floorpad:last');
    return { round: last?.round ?? null, payouts: last?.payouts ?? null, error: e, fromCache: !!last };
  }
}

/** Floors on Solana, written by keeper/market.js. null when it has never run. */
export async function loadMarket() {
  try {
    const r = await getJson('./data/market.json');
    return r.missing ? null : r.value;
  } catch {
    return null;
  }
}

/** Live price in SOL per token from the deepest SOL pair, or null. */
export async function livePrice(ca) {
  if (!ca) return null;
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(ca)}`);
    if (!res.ok) return null;
    const pairs = (await res.json()).filter((p) => p?.quoteToken?.address === WSOL && Number(p.priceNative) > 0);
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const p = pairs[0];
    if (!p) return null;
    const now = Date.now() / 1000;
    const price = Number(p.priceNative);
    // Real anchors from DexScreener's own % changes, used when the keeper has no history yet.
    const ch = p.priceChange ?? {};
    const anchors = [[86400, ch.h24], [21600, ch.h6], [3600, ch.h1], [300, ch.m5]]
      .filter(([, c]) => Number.isFinite(Number(c)))
      .map(([ago, c]) => [now - ago, price / (1 + Number(c) / 100)]);
    return { price, anchors: [...anchors, [now, price]] };
  } catch {
    return null;
  }
}

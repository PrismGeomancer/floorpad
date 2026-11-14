// Pure summary of every open SOL limit buy into "floors" per coin, a featured coin, and a tape
// of the newest bids. Uses the same rules as Floorpad rounds (site/js/rules.js).
import { ordersToBids } from './orders.js';
import { scoreBid, wallBands } from '../../site/js/rules.js';

// Not coins with a "floor" in Floorpad's sense: stablecoins, staked SOL, LP tokens.
export const EXCLUDED_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', // USDS
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', // PYUSD
  '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH', // USDG
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
  'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', // JupSOL
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4', // JLP
  'So11111111111111111111111111111111111111112', // wSOL
]);

const r6 = (x) => Math.round(x * 1e6) / 1e6;

/**
 * A small, embeddable version of a coin's real logo. Some logo hosts block use on other
 * sites, IPFS gateways rate-limit, and some originals are 300 KB. So: IPFS goes through a
 * gateway that answers, and every logo is resized to 96px WebP by an image proxy.
 */
export function logoUrl(raw) {
  if (typeof raw !== 'string' || !/^https:\/\//.test(raw)) return null;
  let u = raw;
  const cid = /\/ipfs\/([^?#]+)/.exec(u)?.[1];
  if (cid) u = `https://ipfs.filebase.io/ipfs/${cid}`;
  return `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=96&h=96&fit=cover&output=webp`;
}

/** Staked-SOL tokens trade near 1 SOL and are not meme floors. */
export function isStakedSol(p) {
  return !!p && p.priceSol >= 0.9 && p.priceSol <= 2 && /sol$/i.test(p.symbol ?? '');
}

/**
 * Real bid rows for a coin, in the same shape as round.json bids, so the site can show a
 * labelled preview of the bidders table. Sorted like a round: points, then size.
 */
const previewBids = (bids) => bids
  .filter((b) => b.distancePct >= 0 && b.distancePct <= 45)
  .sort((a, b) => b.points - a.points || b.remainingSol - a.remainingSol)
  .slice(0, 30)
  .map((b) => ({
    order: b.order,
    wallet: b.wallet,
    sol: r6(b.remainingSol),
    distancePct: Math.round(b.distancePct * 100) / 100,
    restingMinutes: Math.floor(b.ageMinutes),
    distanceMult: b.distanceMult,
    ageMult: b.ageMult,
    mult: Math.round(b.distanceMult * b.ageMult * 100) / 100,
    points: b.points,
    status: b.status,
  }));

/**
 * orders: decoded V1 orders (input wSOL). decimals: {mint: n}. prices: {mint: {priceSol, priceUsd, symbol, name, image, pair, change24h}}.
 * Coins are ranked by SOL resting within the counting range.
 */
export function summarizeMarket({ orders, decimals, prices, cfg, nowSec, maxCoins = 12, maxTape = 14 }) {
  const byMint = new Map();
  for (const o of orders) {
    if (!byMint.has(o.outputMint)) byMint.set(o.outputMint, []);
    byMint.get(o.outputMint).push(o);
  }

  let totalSol = 0;
  for (const o of orders) totalSol += Number(o.making) / 1e9;

  const coins = [];
  const scoredBy = new Map();
  for (const [mint, list] of byMint) {
    const p = prices[mint];
    const dec = decimals[mint];
    if (!p || !Number.isInteger(dec) || isStakedSol(p)) continue;
    const bids = ordersToBids(list, { tokenDecimals: dec, nowSec })
      .map((b) => ({ ...b, ...scoreBid(b, p.priceSol, cfg) }))
      .filter((b) => b.status !== 'too-small');
    scoredBy.set(mint, bids);
    const inRange = bids.filter((b) => b.distanceMult > 0);
    if (!inRange.length) continue;
    const bands = wallBands(bids, cfg);
    coins.push({
      mint,
      symbol: p.symbol,
      name: p.name,
      image: p.image,
      logo: logoUrl(p.image),
      pair: p.pair,
      dex: p.dex,
      priceSol: p.priceSol,
      priceUsd: p.priceUsd,
      change24h: p.change24h,
      bands,
      inRangeSol: r6(inRange.reduce((a, b) => a + b.remainingSol, 0)),
      inRangeBids: inRange.length,
      wallets: new Set(inRange.map((b) => b.wallet)).size,
      nearestPct: Math.round(Math.min(...inRange.map((b) => b.distancePct)) * 100) / 100,
      biggestSol: r6(Math.max(...inRange.map((b) => b.remainingSol))),
      oldestDays: Math.floor(Math.max(...inRange.map((b) => b.ageMinutes)) / 1440),
      bids: previewBids(bids),
      viaUsd: !!p.viaUsd,
      spark: null,
    });
  }
  coins.sort((a, b) => b.inRangeSol - a.inRangeSol || b.inRangeBids - a.inRangeBids);
  const top = coins.slice(0, maxCoins);

  const featured = pickFeatured(top);

  // Tape: the newest open bids of at least the minimum size, with % under price when the coin is priced.
  const tape = [...orders]
    .filter((o) => Number(o.making) / 1e9 >= cfg.minBidSol && prices[o.outputMint] && !isStakedSol(prices[o.outputMint]))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxTape)
    .map((o) => {
      const p = prices[o.outputMint];
      const dec = decimals[o.outputMint];
      let distancePct = null;
      if (p && Number.isInteger(dec)) {
        const bidPrice = (Number(o.oriMaking) / 1e9) / (Number(o.oriTaking) / 10 ** dec);
        distancePct = Math.round(((p.priceSol - bidPrice) / p.priceSol) * 10000) / 100;
      }
      return { order: o.order, wallet: o.wallet, mint: o.outputMint, symbol: p?.symbol ?? null, image: p?.image ?? null, logo: logoUrl(p?.image), sol: r6(Number(o.making) / 1e9), distancePct, createdAt: o.createdAt };
    });

  return {
    version: 1,
    time: new Date(nowSec * 1000).toISOString(),
    rangePct: cfg.rangePct,
    totals: {
      orders: orders.length,
      coins: byMint.size,
      sol: r6(totalSol),
      inRangeSol: r6(coins.reduce((a, c) => a + c.inRangeSol, 0)),
      floors: coins.length,
    },
    coins: top,
    featured,
    tape,
  };
}

/**
 * The coin the hero previews before $FLOOR exists: the most bids in range,
 * then the most SOL. Coins with a price history win over coins without one.
 */
export function pickFeatured(coins) {
  // Prefer coins with a price history, then coins that trade against SOL (meme coins, not
  // tokenized stocks priced in USD), then the most bids in range, then the most SOL.
  const ranked = [...coins].sort((a, b) => (!!b.spark - !!a.spark) || (!!a.viaUsd - !!b.viaUsd) || b.inRangeBids - a.inRangeBids || b.inRangeSol - a.inRangeSol);
  return ranked[0]?.mint ?? null;
}

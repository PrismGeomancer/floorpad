// Floorpad round rules. Pure functions only: no DOM, no network, no clock.
// Shared by the site (preview, worked example) and the keeper (real rounds).

export const LAMPORTS_PER_SOL = 1_000_000_000;

// Distances and ages are compared after rounding, so that 5% computed as
// 4.999999999 or 5.000000001 from float maths still lands on the 5% edge.
const EPS_DIGITS = 6;
const round6 = (x) => Math.round(x * 10 ** EPS_DIGITS) / 10 ** EPS_DIGITS;

/** Percent under price: 0 at the price, 30 at 30% under, negative above. */
export function distancePct(bidPrice, price) {
  if (!(price > 0) || !(bidPrice >= 0)) return NaN;
  return round6(((price - bidPrice) / price) * 100);
}

/**
 * Distance multiplier. Bands are [upToPct, mult] in ascending order, inclusive
 * at the upper edge: with [[5,3],[15,2],[30,1]], exactly 5% is 3x and exactly
 * 30% is 1x. Above the last band, or above the price, it is 0.
 */
export function distanceMult(pct, bands) {
  if (!Number.isFinite(pct) || pct < 0) return 0;
  const p = round6(pct);
  for (const [upTo, mult] of bands) if (p <= upTo) return mult;
  return 0;
}

/** "1r" = rounds, "24h" = hours, "7d" = days, null = no upper limit. Result in minutes. */
export function spanMinutes(span, roundMinutes) {
  if (span === null || span === undefined) return Infinity;
  const m = /^(\d+(?:\.\d+)?)([rhd])$/.exec(String(span));
  if (!m) throw new Error(`bad age span: ${span}`);
  const n = Number(m[1]);
  return m[2] === 'r' ? n * roundMinutes : m[2] === 'h' ? n * 60 : n * 1440;
}

/**
 * Age multiplier. Bands are [upTo, mult]. The first band is "under" (strict):
 * a bid must rest one FULL round, so exactly one round already counts. Later
 * bands are "up to" (inclusive): exactly 24h is still 1x, exactly 7d is 1.5x.
 */
export function ageMult(ageMinutes, ageBands, roundMinutes) {
  if (!Number.isFinite(ageMinutes) || ageMinutes < 0) return 0;
  const a = round6(ageMinutes);
  for (let i = 0; i < ageBands.length; i++) {
    const [span, mult] = ageBands[i];
    const lim = spanMinutes(span, roundMinutes);
    if (i === 0 ? a < lim : a <= lim) return mult;
  }
  return 0;
}

/**
 * Score one bid. `remainingSol` is what is still open (partly filled bids count
 * only the open part). Gives the multipliers, points and a status.
 */
export function scoreBid({ remainingSol, bidPrice, ageMinutes }, price, cfg) {
  const dist = distancePct(bidPrice, price);
  const dm = distanceMult(dist, cfg.distanceBands);
  const am = ageMult(ageMinutes, cfg.ageBands, cfg.roundMinutes);
  const big = remainingSol >= cfg.minBidSol - 1e-12;
  const points = big ? round6(remainingSol * dm * am) : 0;
  let status = 'counted';
  if (!big) status = 'too-small';
  else if (dm === 0) status = 'out-of-range';
  else if (am === 0) status = 'too-new';
  return { distancePct: dist, distanceMult: dm, ageMult: am, points, status };
}

/**
 * Split a pot (lamports, BigInt) across scored bids by points.
 *
 * - Shares are summed per wallet and floored to whole lamports. The rounding
 *   remainder goes to `carry.pool` and joins the next pot.
 * - Each wallet's earlier unsent dust (`carry.wallets[w]`) is added to its share.
 *   If the total is still under `thresholdLamports`, it carries over again.
 * - Zero pot or zero total points: nothing is paid, carry is unchanged.
 *
 * Result: { payouts: [{wallet, lamports}], carry, sharesByWallet }.
 */
export function splitPot(potLamports, scored, carry, thresholdLamports) {
  const pot = BigInt(potLamports);
  const threshold = BigInt(thresholdLamports);
  const prev = { pool: BigInt(carry?.pool ?? 0), wallets: {} };
  for (const [w, v] of Object.entries(carry?.wallets ?? {})) prev.wallets[w] = BigInt(v);

  // Points per wallet, scaled to integers (6 decimals) so the split is exact.
  const pts = new Map();
  for (const b of scored) {
    if (!(b.points > 0)) continue;
    const p = BigInt(Math.round(b.points * 1e6));
    pts.set(b.wallet, (pts.get(b.wallet) ?? 0n) + p);
  }
  const total = [...pts.values()].reduce((a, b) => a + b, 0n);

  const out = { payouts: [], carry: { pool: prev.pool, wallets: { ...prev.wallets } }, sharesByWallet: {} };
  if (pot <= 0n || total === 0n) return stringifyCarry(out);

  let used = 0n;
  for (const [w, p] of pts) {
    const share = (pot * p) / total;
    used += share;
    out.sharesByWallet[w] = share;
    const owed = share + (out.carry.wallets[w] ?? 0n);
    if (owed >= threshold && owed > 0n) {
      out.payouts.push({ wallet: w, lamports: owed });
      delete out.carry.wallets[w];
    } else if (owed > 0n) {
      out.carry.wallets[w] = owed;
    }
  }
  // The pot passed in already includes the old pool; the new pool is the floor remainder.
  out.carry.pool = pot - used;
  out.payouts.sort((a, b) => (b.lamports > a.lamports ? 1 : b.lamports < a.lamports ? -1 : a.wallet.localeCompare(b.wallet)));
  return stringifyCarry(out);
}

function stringifyCarry(out) {
  return {
    payouts: out.payouts,
    sharesByWallet: out.sharesByWallet,
    carry: {
      pool: out.carry.pool.toString(),
      wallets: Object.fromEntries(Object.entries(out.carry.wallets).map(([w, v]) => [w, v.toString()])),
    },
  };
}

/** Sum of SOL resting in each distance band, for the wall. */
export function wallBands(bids, cfg) {
  let from = 0;
  return cfg.distanceBands.map(([upTo, mult]) => {
    const inBand = bids.filter((b) => b.remainingSol >= cfg.minBidSol - 1e-12 && b.distancePct >= 0 && (from === 0 ? b.distancePct <= upTo : b.distancePct > from && b.distancePct <= upTo));
    const band = { from, to: upTo, mult, sol: round6(inBand.reduce((a, b) => a + b.remainingSol, 0)), count: inBand.length };
    from = upTo;
    return band;
  });
}

/**
 * The worked example from the copy deck, computed from config so it always
 * matches the live rules: 2 SOL at 4% for two days vs 5 SOL at 20% for an hour.
 */
export function workedExample(cfg) {
  const a = { sol: 2, pct: 4, ageMin: 2 * 1440 };
  const b = { sol: 5, pct: 20, ageMin: 60 };
  for (const x of [a, b]) {
    x.dm = distanceMult(x.pct, cfg.distanceBands);
    x.am = ageMult(x.ageMin, cfg.ageBands, cfg.roundMinutes);
    x.points = round6(x.sol * x.dm * x.am);
  }
  return { a, b, total: round6(a.points + b.points) };
}

/** Fill-likelihood key for the hero readout, by distance band index. */
export function fillKey(pct, cfg) {
  if (!Number.isFinite(pct) || pct < 0) return 'near';
  const bands = cfg.distanceBands;
  if (pct > bands[bands.length - 1][0]) return 'out';
  if (pct <= bands[0][0]) return 'near';
  if (bands.length > 2 && pct <= bands[1][0]) return 'mid';
  return 'far';
}

/** Round index for a time: slot-based, so two keeper runs in one slot share a number. */
export function roundIndex(nowMs, cfg, firstRoundAtMs) {
  const slot = cfg.roundMinutes * 60_000;
  const base = Number.isFinite(firstRoundAtMs) ? Math.floor(firstRoundAtMs / slot) : 0;
  return Math.floor(nowMs / slot) - base + 1;
}

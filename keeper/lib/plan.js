// Pure round planning: bids + price + pot in, snapshot and payout plan out.
import { scoreBid, splitPot, wallBands, LAMPORTS_PER_SOL } from '../../site/js/rules.js';
import { payoutFees } from './payout.js';

export function scoreAll(bids, price, cfg) {
  return bids
    .map((b) => ({ ...b, ...scoreBid(b, price, cfg) }))
    .filter((b) => b.status !== 'too-small')
    .sort((a, b) => b.points - a.points || b.remainingSol - a.remainingSol || a.order.localeCompare(b.order));
}

/**
 * Plan the split. `grossLamports` = fees claimed this round (net of the claim
 * transaction's own fee) plus the carried pool. Payout network fees come out
 * of it; the recipient count decides the fees, so iterate until stable.
 */
export function planSplit({ grossLamports, scored, carry, cfg, priorityMicroLamports }) {
  const threshold = BigInt(Math.round(cfg.sendThresholdSol * LAMPORTS_PER_SOL));
  const gross = BigInt(grossLamports);
  let fees = 0n;
  let split = splitPot(gross > 0n ? gross : 0n, scored, carry, threshold);
  for (let i = 0; i < 6; i++) {
    const f = payoutFees(split.payouts.length, priorityMicroLamports);
    if (f === fees) break;
    fees = f;
    const pot = gross - fees;
    split = splitPot(pot > 0n ? pot : 0n, scored, carry, threshold);
  }
  if (split.payouts.length === 0) fees = 0n;
  const pot = gross - fees > 0n ? gross - fees : 0n;
  return { potLamports: pot, feesLamports: fees, ...split };
}

/** Build the public snapshot written to data/round.json. */
export function buildSnapshot({ cfg, round, nowMs, mode, price, scored, plan, vaultLamports, history, signatures = [], claimSignature = null, note = null, payoutBalanceLamports = null }) {
  const totalPts = scored.reduce((a, b) => a + b.points, 0);
  const shareOf = (w) => plan?.sharesByWallet?.[w];
  const sol = (l) => Number(BigInt(l)) / LAMPORTS_PER_SOL;
  const inRange = scored.filter((b) => b.distanceMult > 0);
  return {
    version: 1,
    mode,
    round,
    time: new Date(nowMs).toISOString(),
    nextAt: new Date(nowMs + cfg.roundMinutes * 60_000).toISOString(),
    price: price ? { sol: price.priceSol, usd: price.priceUsd, pair: price.pair, dex: price.dex } : null,
    potSol: plan ? sol(plan.potLamports) : 0,
    feesSol: plan ? sol(plan.feesLamports) : 0,
    potWaitingSol: vaultLamports != null ? sol(vaultLamports) : 0,
    payoutBalanceSol: payoutBalanceLamports != null ? sol(payoutBalanceLamports) : null,
    floorSol: Math.round(inRange.reduce((a, b) => a + b.remainingSol, 0) * 1e6) / 1e6,
    counted: scored.filter((b) => b.points > 0).length,
    bands: wallBands(scored, cfg),
    bids: scored.map((b) => {
      const walletPts = scored.filter((x) => x.wallet === b.wallet).reduce((a, x) => a + x.points, 0);
      const ws = shareOf(b.wallet);
      return {
        order: b.order,
        wallet: b.wallet,
        sol: b.remainingSol,
        priceSol: b.bidPrice,
        distancePct: Math.round(b.distancePct * 100) / 100,
        restingMinutes: Math.floor(b.ageMinutes),
        distanceMult: b.distanceMult,
        ageMult: b.ageMult,
        mult: Math.round(b.distanceMult * b.ageMult * 100) / 100,
        points: b.points,
        sharePct: totalPts > 0 ? Math.round((b.points / totalPts) * 1e6) / 1e4 : 0,
        shareSol: ws !== undefined && walletPts > 0 ? Math.round(sol(ws) * (b.points / walletPts) * 1e9) / 1e9 : 0,
        status: b.status,
      };
    }),
    payouts: (plan?.payouts ?? []).map((p) => ({ wallet: p.wallet, sol: sol(p.lamports) })),
    signatures,
    claimSignature,
    note,
    history,
  };
}

/** Keep one price point per round for the hero chart, newest last, at most 144 (24h of 10-minute rounds). */
export function appendHistory(history, nowMs, priceSol, max = 144) {
  const h = (history ?? []).filter((p) => Array.isArray(p) && p.length === 2);
  if (priceSol > 0) h.push([Math.floor(nowMs / 1000), priceSol]);
  return h.slice(-max);
}

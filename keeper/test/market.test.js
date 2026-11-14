import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMarket, pickFeatured, isStakedSol, EXCLUDED_MINTS, logoUrl } from '../lib/market.js';
import { WSOL } from '../lib/orders.js';

const cfg = {
  roundMinutes: 10, rangePct: 30, minBidSol: 0.05, sendThresholdSol: 0.001,
  distanceBands: [[5, 3], [15, 2], [30, 1]],
  ageBands: [['1r', 0], ['24h', 1], ['7d', 1.5], [null, 2]],
};
const now = 2_000_000_000;
// price 1 SOL per token, 6 decimals: a bid at p SOL/token for s SOL takes s/p tokens.
const order = (id, mint, sol, price, ageMin, wallet = 'W' + id) => ({
  order: id, wallet, inputMint: WSOL, outputMint: mint, expiredAt: null,
  oriMaking: BigInt(Math.round(sol * 1e9)), oriTaking: BigInt(Math.round((sol / price) * 1e6)),
  making: BigInt(Math.round(sol * 1e9)), taking: 0n, createdAt: now - ageMin * 60,
});
const P = (sym, priceSol = 1) => ({ priceSol, priceUsd: priceSol * 150, symbol: sym, name: sym, image: null, pair: 'pair' + sym, dex: 'x', change24h: 0 });

test('market: floors ranked by SOL within range, unpriced and out-of-range coins left out', () => {
  const orders = [
    order('a1', 'A', 10, 0.96, 60), order('a2', 'A', 5, 0.5, 60),  // A: 10 in range, 5 out
    order('b1', 'B', 3, 0.9, 60), order('b2', 'B', 3, 0.8, 60),     // B: 6 in range (10% and 20% under)
    order('c1', 'C', 50, 0.1, 60),                                  // C: only out of range
    order('d1', 'D', 99, 0.99, 60),                                  // D: not priced
    order('e1', 'E', 0.01, 0.99, 60),                                // E: under minimum
  ];
  const m = summarizeMarket({ orders, decimals: { A: 6, B: 6, C: 6, D: 6, E: 6 }, prices: { A: P('A'), B: P('B'), C: P('C'), E: P('E') }, cfg, nowSec: now });
  assert.deepEqual(m.coins.map((c) => c.symbol), ['A', 'B']);
  assert.equal(m.coins[0].inRangeSol, 10);
  assert.equal(m.coins[0].nearestPct, 4);
  assert.deepEqual(m.coins[1].bands.map((b) => b.sol), [0, 3, 3]); // 10% under → 2x band, 20% under → 1x band
  assert.equal(m.totals.orders, 7);
  assert.equal(m.totals.inRangeSol, 16);
  assert.equal(m.featured, 'B', 'most bids in range wins when neither has history');
});

test('market: staked SOL is not a floor; tape is newest first, priced only', () => {
  const orders = [order('j', 'J', 5, 1.0, 1), order('x', 'X', 1, 0.95, 5), order('y', 'Y', 1, 0.9, 2), order('z', 'Z', 1, 0.9, 1)];
  const m = summarizeMarket({ orders, decimals: { J: 6, X: 6, Y: 6, Z: 6 }, prices: { J: P('JSOL', 1.05), X: P('X'), Y: P('Y') }, cfg, nowSec: now });
  assert.ok(isStakedSol(P('JSOL', 1.05)));
  assert.ok(!isStakedSol(P('SOLANA', 0.001)));
  assert.ok(!m.coins.some((c) => c.symbol === 'JSOL'));
  assert.deepEqual(m.tape.map((t) => t.symbol), ['Y', 'X']);
  assert.equal(m.tape[1].distancePct, 5);
});

test('featured prefers a coin with price history, then most bids', () => {
  assert.equal(pickFeatured([{ mint: 'big', inRangeBids: 9, inRangeSol: 99, spark: null }, { mint: 'hist', inRangeBids: 1, inRangeSol: 1, spark: [[1, 1]] }]), 'hist');
  assert.equal(pickFeatured([{ mint: 'a', inRangeBids: 1, inRangeSol: 50, spark: [] }, { mint: 'b', inRangeBids: 3, inRangeSol: 5, spark: [] }]), 'b');
  assert.equal(pickFeatured([]), null);
  assert.ok(EXCLUDED_MINTS.has('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'));
});

test('logos: IPFS moves to a gateway that answers, every logo is proxied small', () => {
  assert.equal(logoUrl(null), null);
  assert.equal(logoUrl('http://insecure.example/a.png'), null);
  const ipfs = logoUrl('https://ipfs.io/ipfs/bafyabc123');
  assert.ok(ipfs.startsWith('https://wsrv.nl/?url='));
  assert.ok(decodeURIComponent(ipfs).includes('https://ipfs.filebase.io/ipfs/bafyabc123'));
  assert.ok(logoUrl('https://cdn.dexscreener.com/cms/images/x?width=1').includes('w=96'));
});

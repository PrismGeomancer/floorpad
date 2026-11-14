import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distancePct, distanceMult, ageMult, scoreBid, splitPot, wallBands, workedExample, fillKey, roundIndex, spanMinutes } from '../../site/js/rules.js';

const cfg = {
  roundMinutes: 10, rangePct: 30, minBidSol: 0.05, sendThresholdSol: 0.001,
  distanceBands: [[5, 3], [15, 2], [30, 1]],
  ageBands: [['1r', 0], ['24h', 1], ['7d', 1.5], [null, 2]],
};
const D = cfg.distanceBands;
const A = (m) => ageMult(m, cfg.ageBands, cfg.roundMinutes);

test('points = SOL × distance × age', () => {
  const s = scoreBid({ remainingSol: 2, bidPrice: 0.96, ageMinutes: 2 * 1440 }, 1, cfg);
  assert.equal(s.distancePct, 4);
  assert.equal(s.distanceMult, 3);
  assert.equal(s.ageMult, 1.5);
  assert.equal(s.points, 9);
  assert.equal(s.status, 'counted');
});

test('distance band edges: exactly 5%, 15%, 30%', () => {
  assert.equal(distanceMult(0, D), 3);
  assert.equal(distanceMult(5, D), 3);
  assert.equal(distanceMult(5.000001, D), 2);
  assert.equal(distanceMult(15, D), 2);
  assert.equal(distanceMult(15.000001, D), 1);
  assert.equal(distanceMult(30, D), 1);
  assert.equal(distanceMult(30.000001, D), 0);
  assert.equal(distanceMult(-0.1, D), 0, 'above the price does not count');
});

test('distance edges survive float maths from real prices', () => {
  // 0.95 / 1, 0.85 / 1, 0.7 / 1 are not exact in binary floating point.
  assert.equal(distanceMult(distancePct(0.95, 1), D), 3);
  assert.equal(distanceMult(distancePct(0.85, 1), D), 2);
  assert.equal(distanceMult(distancePct(0.7, 1), D), 1);
  assert.equal(distanceMult(distancePct(0.0000007, 0.000001), D), 1);
  assert.equal(distanceMult(distancePct(0.00000095, 0.000001), D), 3);
});

test('age band edges', () => {
  assert.equal(A(0), 0);
  assert.equal(A(9.99), 0, 'under one full round');
  assert.equal(A(10), 1, 'exactly one round counts');
  assert.equal(A(24 * 60), 1, 'exactly 24h is still 1x');
  assert.equal(A(24 * 60 + 0.01), 1.5);
  assert.equal(A(7 * 1440), 1.5, 'exactly 7d is still 1.5x');
  assert.equal(A(7 * 1440 + 0.01), 2);
  assert.equal(A(365 * 1440), 2);
  assert.equal(A(-1), 0);
});

test('age spans parse r/h/d', () => {
  assert.equal(spanMinutes('1r', 10), 10);
  assert.equal(spanMinutes('24h', 10), 1440);
  assert.equal(spanMinutes('7d', 10), 10080);
  assert.equal(spanMinutes(null, 10), Infinity);
  assert.throws(() => spanMinutes('7w', 10));
});

test('partly filled bid counts only what is still open', () => {
  // Original bid 10 SOL, 7.5 SOL filled, 2.5 SOL remaining.
  const s = scoreBid({ remainingSol: 2.5, bidPrice: 0.9, ageMinutes: 60 }, 1, cfg);
  assert.equal(s.points, 2.5 * 2 * 1);
});

test('bids under the minimum and status labels', () => {
  assert.equal(scoreBid({ remainingSol: 0.049, bidPrice: 0.99, ageMinutes: 60 }, 1, cfg).status, 'too-small');
  assert.equal(scoreBid({ remainingSol: 0.049, bidPrice: 0.99, ageMinutes: 60 }, 1, cfg).points, 0);
  assert.equal(scoreBid({ remainingSol: 0.05, bidPrice: 0.99, ageMinutes: 60 }, 1, cfg).points, 0.15);
  assert.equal(scoreBid({ remainingSol: 1, bidPrice: 0.5, ageMinutes: 60 }, 1, cfg).status, 'out-of-range');
  assert.equal(scoreBid({ remainingSol: 1, bidPrice: 0.99, ageMinutes: 5 }, 1, cfg).status, 'too-new');
});

test('split by points, floor dust goes to the pool', () => {
  const r = splitPot(1_000_000_000n, [{ wallet: 'A', points: 9 }, { wallet: 'B', points: 5 }], null, 1_000_000n);
  const byW = Object.fromEntries(r.payouts.map((p) => [p.wallet, p.lamports]));
  assert.equal(byW.A, 642_857_142n); // 9/14
  assert.equal(byW.B, 357_142_857n); // 5/14
  assert.equal(r.carry.pool, '1');
  assert.equal(byW.A + byW.B + BigInt(r.carry.pool), 1_000_000_000n, 'nothing is lost');
});

test('several bids from one wallet are paid as one transfer', () => {
  const r = splitPot(1_000_000n * 100n, [{ wallet: 'A', points: 1 }, { wallet: 'A', points: 1 }, { wallet: 'B', points: 2 }], null, 1_000_000n);
  assert.equal(r.payouts.length, 2);
  assert.equal(r.payouts[0].lamports, r.payouts[1].lamports);
});

test('dust carry: small shares wait, then pay out together', () => {
  // Pot 1.5M lamports; A has 1 point of 3 → 500k, under the 1M threshold.
  const r1 = splitPot(1_500_000n, [{ wallet: 'A', points: 1 }, { wallet: 'B', points: 2 }], null, 1_000_000n);
  assert.deepEqual(r1.payouts.map((p) => p.wallet), ['B']);
  assert.equal(r1.carry.wallets.A, '500000');
  // Next round A earns another 500k: 1M owed, now paid, carry cleared.
  const r2 = splitPot(1_500_000n, [{ wallet: 'A', points: 1 }, { wallet: 'B', points: 2 }], r1.carry, 1_000_000n);
  const a = r2.payouts.find((p) => p.wallet === 'A');
  assert.equal(a.lamports, 1_000_000n);
  assert.equal(r2.carry.wallets.A, undefined);
});

test('zero pot: nothing paid, carry unchanged', () => {
  const carry = { pool: '7', wallets: { A: '123' } };
  const r = splitPot(0n, [{ wallet: 'A', points: 5 }], carry, 1_000_000n);
  assert.equal(r.payouts.length, 0);
  assert.deepEqual(r.carry, carry);
});

test('zero points: nothing paid, carry unchanged', () => {
  const carry = { pool: '0', wallets: {} };
  const r = splitPot(5_000_000_000n, [{ wallet: 'A', points: 0 }, { wallet: 'B', points: 0 }], carry, 1_000_000n);
  assert.equal(r.payouts.length, 0);
  assert.deepEqual(r.carry, carry);
});

test('wall bands sum SOL per band, edges inclusive at the top', () => {
  const bids = [
    { remainingSol: 1, distancePct: 0 }, { remainingSol: 2, distancePct: 5 },
    { remainingSol: 3, distancePct: 5.01 }, { remainingSol: 4, distancePct: 30 },
    { remainingSol: 9, distancePct: 31 }, { remainingSol: 0.01, distancePct: 2 },
  ];
  const b = wallBands(bids, cfg);
  assert.deepEqual(b.map((x) => [x.from, x.to, x.mult, x.sol, x.count]), [[0, 5, 3, 3, 2], [5, 15, 2, 3, 1], [15, 30, 1, 4, 1]]);
});

test('worked example matches the copy deck at default config', () => {
  const w = workedExample(cfg);
  assert.equal(w.a.points, 9);
  assert.equal(w.b.points, 5);
  assert.equal(w.total, 14);
});

test('fill keys for the hero readout', () => {
  assert.equal(fillKey(1, cfg), 'near');
  assert.equal(fillKey(5, cfg), 'near');
  assert.equal(fillKey(10, cfg), 'mid');
  assert.equal(fillKey(30, cfg), 'far');
  assert.equal(fillKey(31, cfg), 'out');
});

test('round index is slot based', () => {
  const start = Date.parse('2026-11-13T00:00:00Z');
  assert.equal(roundIndex(start, cfg, start), 1);
  assert.equal(roundIndex(start + 9 * 60_000, cfg, start), 1, 'two runs in one slot share a number');
  assert.equal(roundIndex(start + 10 * 60_000, cfg, start), 2);
});

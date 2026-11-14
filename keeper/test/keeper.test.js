import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import { decodeOrder, ordersToBids, WSOL } from '../lib/orders.js';
import { encodeBase58 } from '../lib/base58.js';
import { isRoundPaid, roundFromMemo, memoFor, recordRound, emptyLedger } from '../lib/ledger.js';
import { buildPayoutTx, MAX_TRANSFERS_PER_TX, payoutFees, payoutTxFee, chunk, loadSigner } from '../lib/payout.js';
import { pickSolPair } from '../lib/price.js';
import { planSplit, scoreAll, buildSnapshot, appendHistory } from '../lib/plan.js';
import { validateConfig, loadConfig } from '../lib/config.js';

const cfg = {
  roundMinutes: 10, rangePct: 30, minBidSol: 0.05, sendThresholdSol: 0.001,
  distanceBands: [[5, 3], [15, 2], [30, 1]],
  ageBands: [['1r', 0], ['24h', 1], ['7d', 1.5], [null, 2]],
};

// The real order account from spike/FINDINGS.md, rebuilt from its verified fields.
function fakeOrder({ maker, input = WSOL, output, oriMaking, oriTaking, making, created, expires = null }) {
  const d = Buffer.alloc(372);
  new PublicKey(maker).toBuffer().copy(d, 8);
  new PublicKey(input).toBuffer().copy(d, 40);
  new PublicKey(output).toBuffer().copy(d, 72);
  d.writeBigUInt64LE(BigInt(oriMaking), 208);
  d.writeBigUInt64LE(BigInt(oriTaking), 216);
  d.writeBigUInt64LE(BigInt(making), 224);
  let o = 248;
  if (expires !== null) { d[o] = 1; d.writeBigInt64LE(BigInt(expires), o + 1); o += 9; } else o += 1;
  o += 2 + 32;
  d.writeBigInt64LE(BigInt(created), o);
  return d;
}

test('base58 encodes like web3.js', () => {
  const k = Keypair.generate().publicKey;
  assert.equal(encodeBase58(k.toBuffer()), k.toBase58());
  assert.equal(encodeBase58(Buffer.alloc(32)), '11111111111111111111111111111111');
});

test('decode order, with and without expiry', () => {
  const maker = Keypair.generate().publicKey.toBase58();
  const mint = Keypair.generate().publicKey.toBase58();
  for (const expires of [null, 1_900_000_000]) {
    const o = decodeOrder('X', fakeOrder({ maker, output: mint, oriMaking: 7e9, oriTaking: 40229885057, making: 7e9, created: 1742854797, expires }));
    assert.equal(o.wallet, maker);
    assert.equal(o.outputMint, mint);
    assert.equal(o.inputMint, WSOL);
    assert.equal(o.createdAt, 1742854797);
    assert.equal(o.expiredAt, expires);
  }
});

test('orders to bids: price from original ratio, remaining size, expired dropped', () => {
  const maker = Keypair.generate().publicKey.toBase58();
  const mint = Keypair.generate().publicKey.toBase58();
  const now = 2_000_000_000;
  // 2 SOL for 2,000,000 tokens (6 decimals) → 0.000001 SOL/token; half filled.
  const live = decodeOrder('A', fakeOrder({ maker, output: mint, oriMaking: 2e9, oriTaking: 2e12, making: 1e9, created: now - 3600 }));
  const expired = decodeOrder('B', fakeOrder({ maker, output: mint, oriMaking: 2e9, oriTaking: 2e12, making: 2e9, created: now - 3600, expires: now - 1 }));
  const empty = decodeOrder('C', fakeOrder({ maker, output: mint, oriMaking: 2e9, oriTaking: 2e12, making: 0, created: now - 3600 }));
  const bids = ordersToBids([live, expired, empty], { tokenDecimals: 6, nowSec: now });
  assert.equal(bids.length, 1);
  assert.equal(bids[0].remainingSol, 1);
  assert.ok(Math.abs(bids[0].bidPrice - 0.000001) < 1e-15);
  assert.equal(bids[0].ageMinutes, 60);
});

test('double-pay protection: ledger and on-chain memo both block a round', () => {
  assert.equal(roundFromMemo('[18] floorpad:round:42'), 42);
  assert.equal(roundFromMemo('[22] floorpad:round:42:2/3'), 42);
  assert.equal(roundFromMemo('floorpad:round:420'), 420);
  assert.equal(roundFromMemo('something else'), null);
  assert.equal(roundFromMemo(null), null);
  assert.equal(memoFor(7, 1, 1), 'floorpad:round:7');
  assert.equal(memoFor(7, 2, 3), 'floorpad:round:7:2/3');

  const ledger = { rounds: [{ round: 41 }] };
  assert.deepEqual(isRoundPaid(41, ledger, []), { paid: true, source: 'ledger' });
  assert.deepEqual(isRoundPaid(42, ledger, [{ memo: '[18] floorpad:round:42' }]), { paid: true, source: 'chain' });
  assert.deepEqual(isRoundPaid(42, ledger, [{ memo: '[19] floorpad:round:420' }]), { paid: false });
  assert.deepEqual(isRoundPaid(43, emptyLedger(), [{ memo: null }]), { paid: false });
});

test('ledger records totals per wallet and replaces a re-recorded round', () => {
  let l = recordRound(emptyLedger(), { round: 1 }, [{ wallet: 'A', lamports: 5n }, { wallet: 'B', lamports: 3n }]);
  l = recordRound(l, { round: 2 }, [{ wallet: 'A', lamports: 2n }]);
  assert.equal(l.totalLamports, '10');
  assert.equal(l.byWallet.A, '7');
  assert.deepEqual(l.rounds.map((r) => r.round), [2, 1]);
});

test('a full payout tx fits the 1232-byte limit', () => {
  const payer = Keypair.generate();
  const recipients = Array.from({ length: MAX_TRANSFERS_PER_TX }, () => ({ wallet: Keypair.generate().publicKey.toBase58(), lamports: 123456789n }));
  const tx = buildPayoutTx({ payer: payer.publicKey, recipients, round: 999999, part: 9, parts: 9, blockhash: Keypair.generate().publicKey.toBase58(), priorityMicroLamports: 20000n });
  tx.sign(payer);
  const size = tx.serialize().length;
  assert.ok(size <= 1232, `tx is ${size} bytes`);
});

test('payout fees are exact and grow with the number of txs', () => {
  assert.equal(payoutTxFee(1, 0n), 5000n);
  assert.equal(payoutFees(0, 20000n), 0n);
  assert.equal(chunk(Array.from({ length: 19 })).length, 2);
  assert.ok(payoutFees(19, 20000n) > payoutFees(18, 20000n) + 4999n);
});

test('plan: fees come out of the pot, zero points sends nothing', () => {
  const now = 2_000_000_000;
  const bids = [
    { order: 'o1', wallet: 'A', remainingSol: 2, bidPrice: 0.96, ageMinutes: 2 * 1440 },
    { order: 'o2', wallet: 'B', remainingSol: 5, bidPrice: 0.8, ageMinutes: 60 },
    { order: 'o3', wallet: 'C', remainingSol: 0.01, bidPrice: 0.99, ageMinutes: 60 },
  ];
  const scored = scoreAll(bids, 1, cfg);
  assert.equal(scored.length, 2, 'bids under the minimum are dropped');
  const plan = planSplit({ grossLamports: 1_000_000_000n, scored, carry: { pool: '0', wallets: {} }, cfg, priorityMicroLamports: 20000n });
  const sent = plan.payouts.reduce((a, p) => a + p.lamports, 0n);
  assert.equal(plan.feesLamports, payoutFees(2, 20000n));
  assert.equal(sent + BigInt(plan.carry.pool) + plan.feesLamports, 1_000_000_000n);

  const none = planSplit({ grossLamports: 1_000_000_000n, scored: scoreAll(bids.map((b) => ({ ...b, ageMinutes: 1 })), 1, cfg), carry: { pool: '0', wallets: {} }, cfg, priorityMicroLamports: 20000n });
  assert.equal(none.payouts.length, 0);
  assert.equal(none.feesLamports, 0n);

  const snap = buildSnapshot({ cfg, round: 3, nowMs: now * 1000, mode: 'dry-run', price: { priceSol: 1 }, scored, plan, vaultLamports: 0n, history: [] });
  assert.equal(snap.counted, 2);
  assert.equal(snap.floorSol, 7);
  assert.equal(snap.bids[0].wallet, 'A');
  assert.ok(Math.abs(snap.bids[0].sharePct - (9 / 14) * 100) < 0.001);
  assert.doesNotThrow(() => JSON.stringify(snap), 'snapshot has no BigInt');
});

test('price picks the deepest SOL pair', () => {
  const p = pickSolPair([
    { quoteToken: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }, priceNative: '5', liquidity: { usd: 9e9 } },
    { quoteToken: { address: WSOL }, priceNative: '0.1', liquidity: { usd: 10 }, pairAddress: 'small' },
    { quoteToken: { address: WSOL }, priceNative: '0.2', liquidity: { usd: 100 }, pairAddress: 'big' },
  ]);
  assert.equal(p.pair, 'big');
  assert.equal(p.priceSol, 0.2);
  assert.equal(pickSolPair([]), null);
});

test('history keeps one point per round, capped', () => {
  let h = [];
  for (let i = 0; i < 200; i++) h = appendHistory(h, i * 600_000, 1 + i);
  assert.equal(h.length, 144);
  assert.equal(h.at(-1)[1], 200);
});

test('signer loads from env only and rejects garbage', () => {
  const k = Keypair.generate();
  assert.ok(loadSigner({ PAYOUT_SECRET_KEY: JSON.stringify([...k.secretKey]) }).publicKey.equals(k.publicKey));
  assert.ok(loadSigner({ PAYOUT_SECRET_KEY: encodeBase58(k.secretKey) }).publicKey.equals(k.publicKey));
  assert.throws(() => loadSigner({}), /not set/);
  assert.throws(() => loadSigner({ PAYOUT_SECRET_KEY: '[1,2,3]' }), /64-byte/);
});

test('config validation', () => {
  assert.doesNotThrow(() => loadConfig());
  assert.throws(() => validateConfig({ ...cfg, distanceBands: [[5, 3], [30, 2], [15, 1]] }));
  assert.throws(() => validateConfig({ ...cfg, rangePct: 25 }));
  assert.throws(() => validateConfig({ ...cfg, sendThresholdSol: 0.0001 }), /rent-exempt/);
});

test('site/config.js matches config.json (run npm run sync-config)', async () => {
  const { readFileSync } = await import('node:fs');
  const site = (await import('../../site/config.js')).default;
  const json = JSON.parse(readFileSync(new URL('../../config.json', import.meta.url), 'utf8'));
  assert.deepEqual({ ...site }, json);
});

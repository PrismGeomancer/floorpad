#!/usr/bin/env node
// Floorpad keeper: runs one round and exits.
//
//   DRY_RUN=1 (default)  read everything, compute the split, write a dry-run snapshot, send nothing.
//   DRY_RUN=0            claim fees and send payouts. Needs PAYOUT_SECRET_KEY.
//
// Env: RPC_URL or HELIUS_API_KEY (optional, public RPC otherwise), PAYOUT_SECRET_KEY (live only),
//      PRIORITY_MICROLAMPORTS (default 20000), NOW (ISO time override, tests only),
//      FLOORPAD_CONFIG (other config file) and DATA_DIR (other data folder), for dry tests.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { loadConfig, ROOT } from './lib/config.js';
import { rpcUrl, rpc } from './lib/rpc.js';
import { fetchOrders, fetchMintDecimals, ordersToBids } from './lib/orders.js';
import { fetchPrice } from './lib/price.js';
import { feeRoute, vaultBalance, claimInstructions } from './lib/pump.js';
import { buildPayoutTx, chunk, loadSigner, KEEP_IN_WALLET_LAMPORTS } from './lib/payout.js';
import { isRoundPaid, recordRound, emptyLedger, emptyCarry, roundFromMemo } from './lib/ledger.js';
import { scoreAll, planSplit, buildSnapshot, appendHistory } from './lib/plan.js';
import { roundIndex } from '../site/js/rules.js';

const DATA = process.env.DATA_DIR ? `${process.env.DATA_DIR.replace(/\/$/, '')}/` : `${ROOT}data/`;
const readJson = (f, fallback) => (existsSync(DATA + f) ? JSON.parse(readFileSync(DATA + f, 'utf8')) : fallback);
const writeJson = (f, v) => { mkdirSync(DATA, { recursive: true }); writeFileSync(DATA + f, JSON.stringify(v, null, 2) + '\n'); };
const log = (...a) => console.log('[keeper]', ...a);

async function main() {
  const cfg = loadConfig(process.env.FLOORPAD_CONFIG || undefined);
  const dry = process.env.DRY_RUN !== '0';
  const priority = BigInt(process.env.PRIORITY_MICROLAMPORTS ?? 20000);
  const nowMs = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const url = rpcUrl();
  const conn = new Connection(url, 'confirmed');

  if (!cfg.contractAddress) { log('contractAddress is empty in config.json. Nothing to do before launch.'); return; }

  const prevRound = readJson('round.json', null);
  const ledger = readJson('payouts.json', emptyLedger());
  const carry = readJson('carry.json', emptyCarry());
  const firstMs = cfg.firstRoundAt ? Date.parse(cfg.firstRoundAt) : (ledger.rounds.at(-1)?.time ? Date.parse(ledger.rounds.at(-1).time) : NaN);
  const round = roundIndex(nowMs, cfg, firstMs);
  log(`round ${round} · ${dry ? 'DRY RUN' : 'LIVE'} · ${new Date(nowMs).toISOString()}`);

  // 1. Price
  const price = await fetchPrice(cfg.contractAddress);
  log(`price ${price.priceSol} SOL (${price.dex} ${price.pair})`);

  // 2. Bids
  const decimals = await fetchMintDecimals(url, cfg.contractAddress);
  const orders = await fetchOrders(url, cfg.contractAddress);
  const bids = ordersToBids(orders, { tokenDecimals: decimals, nowSec });
  log(`open SOL bids: ${bids.length} (from ${orders.length} order accounts)`);

  // 3. Points
  const scored = scoreAll(bids, price.priceSol, cfg);
  const counted = scored.filter((b) => b.points > 0);
  log(`bids ≥ ${cfg.minBidSol} SOL: ${scored.length}, counted: ${counted.length}`);

  const history = appendHistory(prevRound?.history, nowMs, price.priceSol);
  const route = cfg.payoutWallet ? await feeRoute(conn, cfg.contractAddress, cfg.payoutWallet) : null;
  const waiting = route ? await vaultBalance(route) : null;
  if (route && !route.ok) log(`WARNING: ${route.why}`);
  log(`fees waiting in vault: ${waiting === null ? 'unknown (no payoutWallet)' : Number(waiting) / 1e9} SOL`);

  const payoutBalance = cfg.payoutWallet ? BigInt(await conn.getBalance(new PublicKey(cfg.payoutWallet), 'confirmed')) : null;
  const snapshot = (mode, extra = {}) => buildSnapshot({ cfg, round, nowMs, mode, price, scored, vaultLamports: waiting, history, payoutBalanceLamports: payoutBalance, ...extra });

  // Dry run: estimate with what is waiting in the vault, send nothing, keep ledger and carry untouched.
  if (dry) {
    const est = waiting === null ? 0n : waiting - 5000n;
    const plan = counted.length ? planSplit({ grossLamports: (est > 0n ? est : 0n) + BigInt(carry.pool), scored, carry, cfg, priorityMicroLamports: priority }) : null;
    writeJson('round.json', snapshot('dry-run', { plan, note: 'dry-run' }));
    log(`dry run: pot would be ${plan ? Number(plan.potLamports) / 1e9 : 0} SOL to ${plan?.payouts.length ?? 0} wallets. Nothing sent.`);
    return;
  }

  // ---------- LIVE ----------
  if (!route?.ok) throw new Error(`cannot claim: ${route ? route.why : 'payoutWallet is empty'}`);
  const signer = loadSigner();
  if (!signer.publicKey.equals(new PublicKey(cfg.payoutWallet))) throw new Error('PAYOUT_SECRET_KEY does not match payoutWallet');

  // Double-pay guard: ledger first, then the memos on the payout wallet's recent transactions.
  const recent = await rpc(url, 'getSignaturesForAddress', [cfg.payoutWallet, { limit: 100 }]);
  const paid = isRoundPaid(round, ledger, recent);
  if (paid.paid) {
    log(`round ${round} already paid (${paid.source}). Sending nothing.`);
    if (paid.source === 'chain') {
      const sigs = recent.filter((r) => roundFromMemo(r.memo) === round && !r.err).map((r) => r.signature);
      writeJson('payouts.json', recordRound(ledger, { round, time: new Date(nowMs).toISOString(), potSol: null, bidsPaid: null, signatures: sigs, note: 'recovered from chain' }, []));
    }
    writeJson('round.json', snapshot('live', { note: 'already-paid' }));
    return;
  }

  if (counted.length === 0 || (waiting <= 0n && BigInt(carry.pool) === 0n)) {
    log(counted.length === 0 ? 'no bid has points. Not claiming; fees stay in the vault.' : 'nothing to claim.');
    writeJson('round.json', snapshot('live', { note: counted.length === 0 ? 'no-points' : 'zero-pot' }));
    return;
  }

  // 4. Claim. Measure what actually arrived from the payout wallet's own balance change.
  let claimedNet = 0n;
  let claimSignature = null;
  if (waiting > 0n) {
    const tx = new Transaction();
    tx.add(...(await claimInstructions(route)));
    tx.feePayer = signer.publicKey;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(signer);
    claimSignature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await conn.confirmTransaction({ signature: claimSignature, blockhash, lastValidBlockHeight }, 'confirmed');
    const t = await conn.getTransaction(claimSignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    const keys = t.transaction.message.staticAccountKeys ?? t.transaction.message.accountKeys;
    const i = keys.findIndex((k) => k.equals(signer.publicKey));
    claimedNet = BigInt(t.meta.postBalances[i]) - BigInt(t.meta.preBalances[i]);
    log(`claimed ${Number(claimedNet) / 1e9} SOL net of the claim fee (${claimSignature})`);
  }

  // 5. Split. Never spend below the wallet's safety reserve.
  const balance = BigInt(await conn.getBalance(signer.publicKey, 'confirmed'));
  let gross = claimedNet + BigInt(carry.pool);
  const spendable = balance - KEEP_IN_WALLET_LAMPORTS - BigInt(Object.values(carry.wallets).reduce((a, v) => a + BigInt(v), 0n));
  if (gross > spendable) { log(`pot capped by wallet balance: ${Number(spendable) / 1e9} SOL`); gross = spendable > 0n ? spendable : 0n; }
  const plan = planSplit({ grossLamports: gross, scored, carry, cfg, priorityMicroLamports: priority });
  log(`pot ${Number(plan.potLamports) / 1e9} SOL after ${Number(plan.feesLamports) / 1e9} SOL network fees → ${plan.payouts.length} wallets`);

  // 6. Send.
  const parts = chunk(plan.payouts);
  const signatures = [];
  const sent = [];
  const nextCarry = structuredClone(plan.carry);
  for (let p = 0; p < parts.length; p++) {
    try {
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      const tx = buildPayoutTx({ payer: signer.publicKey, recipients: parts[p], round, part: p + 1, parts: parts.length, blockhash, priorityMicroLamports: priority });
      tx.sign(signer);
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      signatures.push(sig);
      sent.push(...parts[p]);
      log(`sent part ${p + 1}/${parts.length}: ${sig}`);
    } catch (e) {
      log(`part ${p + 1}/${parts.length} failed: ${e.message}. Its shares carry over.`);
      for (const r of parts.slice(p).flat()) nextCarry.wallets[r.wallet] = (BigInt(nextCarry.wallets[r.wallet] ?? 0) + BigInt(r.lamports)).toString();
      break;
    }
  }

  // 7. Write. The workflow commits data/.
  const potSol = Number(plan.potLamports) / 1e9;
  if (sent.length) {
    writeJson('payouts.json', recordRound(ledger, { round, time: new Date(nowMs).toISOString(), potSol, bidsPaid: sent.length, signatures, claimSignature }, sent));
  }
  writeJson('carry.json', nextCarry);
  const after = route ? await vaultBalance(route) : null;
  const balanceAfter = BigInt(await conn.getBalance(signer.publicKey, 'confirmed'));
  writeJson('round.json', buildSnapshot({ cfg, round, nowMs, mode: 'live', price, scored, plan, vaultLamports: after, history, signatures, claimSignature, payoutBalanceLamports: balanceAfter }));
  log('done.');
}

main().catch((e) => { console.error('[keeper] FAILED:', e.message); process.exit(1); });

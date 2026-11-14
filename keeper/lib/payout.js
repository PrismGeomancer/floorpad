// Build and send payout transactions. The signer comes only from the environment.
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { encodeBase58 } from './base58.js';
import { memoFor } from './ledger.js';

export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const MAX_TRANSFERS_PER_TX = 18; // checked against the 1232-byte limit in tests
export const BASE_FEE_LAMPORTS = 5000n; // one signature
export const KEEP_IN_WALLET_LAMPORTS = 2_000_000n; // rent-exempt minimum plus room for fees

export function computeUnitLimit(n) { return 20_000 + 600 * n; }

/** Exact network fee for one payout tx with n transfers. */
export function payoutTxFee(n, priorityMicroLamports) {
  const pri = (BigInt(priorityMicroLamports) * BigInt(computeUnitLimit(n)) + 999_999n) / 1_000_000n;
  return BASE_FEE_LAMPORTS + pri;
}

export function chunk(list, size = MAX_TRANSFERS_PER_TX) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Total network fees for paying `nRecipients` wallets. */
export function payoutFees(nRecipients, priorityMicroLamports) {
  return chunk(Array.from({ length: nRecipients })).reduce((a, c) => a + payoutTxFee(c.length, priorityMicroLamports), 0n);
}

export function buildPayoutTx({ payer, recipients, round, part, parts, blockhash, priorityMicroLamports }) {
  const tx = new Transaction({ feePayer: payer, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit(recipients.length) }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: Number(priorityMicroLamports) }));
  tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(memoFor(round, part, parts), 'utf8') }));
  for (const r of recipients) tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: new PublicKey(r.wallet), lamports: BigInt(r.lamports) }));
  return tx;
}

/** Load the payout keypair from PAYOUT_SECRET_KEY (JSON byte array or base58). Never logged. */
export function loadSigner(env = process.env) {
  const raw = (env.PAYOUT_SECRET_KEY ?? '').trim();
  if (!raw) throw new Error('PAYOUT_SECRET_KEY is not set');
  let bytes;
  if (raw.startsWith('[')) bytes = Uint8Array.from(JSON.parse(raw));
  else bytes = decodeBase58(raw);
  if (bytes.length !== 64) throw new Error('PAYOUT_SECRET_KEY must be a 64-byte secret key');
  return Keypair.fromSecretKey(bytes);
}

function decodeBase58(s) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let x = 0n;
  for (const c of s) { const i = A.indexOf(c); if (i < 0) throw new Error('PAYOUT_SECRET_KEY is not valid base58'); x = x * 58n + BigInt(i); }
  const out = [];
  while (x > 0n) { out.unshift(Number(x & 255n)); x >>= 8n; }
  for (const c of s) { if (c === '1') out.unshift(0); else break; }
  return Uint8Array.from(out);
}

export { encodeBase58 };

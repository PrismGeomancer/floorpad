// Ledger, carry and double-pay protection. Pure helpers.

export const MEMO_PREFIX = 'floorpad:round:';

export function memoFor(round, part, parts) {
  return parts > 1 ? `${MEMO_PREFIX}${round}:${part}/${parts}` : `${MEMO_PREFIX}${round}`;
}

/** Round number from an RPC memo field such as "[18] floorpad:round:42" or "...:42:2/3". */
export function roundFromMemo(memo) {
  if (typeof memo !== 'string') return null;
  const m = /floorpad:round:(\d+)(?![\d])/.exec(memo);
  return m ? Number(m[1]) : null;
}

/**
 * A round can be paid once. It counts as paid if the ledger has a live entry
 * for it, or any recent transaction from the payout wallet carries its memo.
 */
export function isRoundPaid(round, ledger, chainMemos = []) {
  if ((ledger?.rounds ?? []).some((r) => r.round === round)) return { paid: true, source: 'ledger' };
  if (chainMemos.some((m) => roundFromMemo(m.memo) === round)) return { paid: true, source: 'chain' };
  return { paid: false };
}

export function emptyLedger() {
  return { totalLamports: '0', byWallet: {}, rounds: [] };
}

export function emptyCarry() {
  return { pool: '0', wallets: {} };
}

/** Add a paid round to the ledger (newest first). `sent` is [{wallet, lamports}]. */
export function recordRound(ledger, entry, sent) {
  const next = structuredClone(ledger ?? emptyLedger());
  let total = BigInt(next.totalLamports ?? 0);
  for (const s of sent) {
    const l = BigInt(s.lamports);
    total += l;
    next.byWallet[s.wallet] = (BigInt(next.byWallet[s.wallet] ?? 0) + l).toString();
  }
  next.totalLamports = total.toString();
  next.rounds = [entry, ...next.rounds.filter((r) => r.round !== entry.round)];
  return next;
}

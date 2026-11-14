// Read open Jupiter limit buys (Trigger V1 / Limit Order program) for one output mint.
// Route verified in spike/FINDINGS.md: getProgramAccounts + memcmp, no registry needed.
import { encodeBase58 } from './base58.js';
import { rpc } from './rpc.js';

export const LIMIT_ORDER_PROGRAM = 'j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X';
export const WSOL = 'So11111111111111111111111111111111111111112';
export const ORDER_SIZE = 372;

/** Decode one order account (layout verified against Jupiter's V1 API). */
export function decodeOrder(pubkey, data) {
  if (data.length !== ORDER_SIZE) throw new Error(`order ${pubkey}: size ${data.length}`);
  const pk = (o) => encodeBase58(data.subarray(o, o + 32));
  const u64 = (o) => data.readBigUInt64LE(o);
  let o = 248;
  let expiredAt = null;
  if (data[o] === 1) { expiredAt = Number(data.readBigInt64LE(o + 1)); o += 9; } else o += 1;
  o += 2 + 32; // feeBps, feeAccount
  const createdAt = Number(data.readBigInt64LE(o));
  return {
    order: pubkey,
    wallet: pk(8),
    inputMint: pk(40),
    outputMint: pk(72),
    oriMaking: u64(208),
    oriTaking: u64(216),
    making: u64(224),
    taking: u64(232),
    expiredAt,
    createdAt,
  };
}

/**
 * Turn decoded orders into bids. Price is SOL per token from the original
 * order ratio. Expired orders and orders with nothing left are dropped.
 */
export function ordersToBids(orders, { tokenDecimals, nowSec }) {
  const bids = [];
  for (const o of orders) {
    if (o.inputMint !== WSOL) continue;
    if (o.expiredAt !== null && o.expiredAt <= nowSec) continue;
    if (o.making <= 0n || o.oriMaking <= 0n || o.oriTaking <= 0n) continue;
    const solIn = Number(o.oriMaking) / 1e9;
    const tokensOut = Number(o.oriTaking) / 10 ** tokenDecimals;
    bids.push({
      order: o.order,
      wallet: o.wallet,
      remainingLamports: o.making.toString(),
      remainingSol: Number(o.making) / 1e9,
      bidPrice: solIn / tokensOut,
      createdAt: o.createdAt,
      ageMinutes: (nowSec - o.createdAt) / 60,
    });
  }
  return bids;
}

export async function fetchOrders(url, mint) {
  const res = await rpc(url, 'getProgramAccounts', [LIMIT_ORDER_PROGRAM, {
    encoding: 'base64',
    filters: [{ dataSize: ORDER_SIZE }, { memcmp: { offset: 40, bytes: WSOL } }, { memcmp: { offset: 72, bytes: mint } }],
  }]);
  return res.map((a) => decodeOrder(a.pubkey, Buffer.from(a.account.data[0], 'base64')));
}

export async function fetchMintDecimals(url, mint) {
  const info = await rpc(url, 'getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  const d = info?.value?.data?.parsed?.info?.decimals;
  if (!Number.isInteger(d)) throw new Error(`could not read decimals for ${mint}`);
  return d;
}

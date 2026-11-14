// Current price in SOL per token from DexScreener's keyless API.
import { WSOL } from './orders.js';

export function pickSolPair(pairs) {
  const sol = (pairs ?? []).filter((p) => p?.quoteToken?.address === WSOL && Number(p.priceNative) > 0);
  sol.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const p = sol[0];
  return p ? { priceSol: Number(p.priceNative), priceUsd: Number(p.priceUsd) || null, pair: p.pairAddress, dex: p.dexId } : null;
}

export async function fetchPrice(ca) {
  const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${ca}`);
  if (!res.ok) throw new Error(`dexscreener HTTP ${res.status}`);
  const p = pickSolPair(await res.json());
  if (!p) throw new Error('dexscreener: no SOL pair for this contract');
  return p;
}

// pump.fun creator fees. Verified read-only in spike/pump-fees.mjs (simulation, no signing).
import { createRequire } from 'node:module';
import { PublicKey } from '@solana/web3.js';

const pump = createRequire(import.meta.url)('@pump-fun/pump-sdk');
const { OnlinePumpSdk, PUMP_SDK, hasCoinCreatorMigratedToSharingConfig, feeSharingConfigPda } = pump;

/**
 * Figure out how fees reach the payout wallet:
 * - "creator": the payout wallet is the coin creator and collects directly.
 * - "sharing": the coin uses a fee-sharing config that pays the payout wallet 100%.
 * Anything else is a config error and the keeper refuses to claim.
 */
export async function feeRoute(connection, mintStr, payoutStr) {
  const sdk = new OnlinePumpSdk(connection);
  const mint = new PublicKey(mintStr);
  const payout = new PublicKey(payoutStr);
  const bc = await sdk.fetchBondingCurve(mint);
  const creator = bc.creator;
  if (hasCoinCreatorMigratedToSharingConfig({ mint, creator })) {
    const cfgAddr = feeSharingConfigPda(mint);
    const info = await connection.getAccountInfo(cfgAddr);
    const cfg = info && PUMP_SDK.decodeSharingConfig(info);
    const ok = cfg && cfg.shareholders.length === 1 && cfg.shareholders[0].address.equals(payout) && cfg.shareholders[0].shareBps === 10_000;
    return { sdk, mint, payout, creator, mode: 'sharing', ok, why: ok ? null : 'fee-sharing config does not pay the payout wallet 100%' };
  }
  const ok = creator.equals(payout);
  return { sdk, mint, payout, creator, mode: 'creator', ok, why: ok ? null : `coin creator ${creator.toBase58()} is not the payout wallet` };
}

/** Lamports waiting in the creator vault(s), read-only. */
export async function vaultBalance(route) {
  const bn = await route.sdk.getCreatorVaultBalanceBothPrograms(route.creator);
  return BigInt(bn.toString());
}

/** Instructions that move the waiting fees to the payout wallet. */
export async function claimInstructions(route) {
  if (!route.ok) throw new Error(route.why);
  if (route.mode === 'creator') return route.sdk.collectCoinCreatorFeeInstructions(route.payout, route.payout);
  const r = await route.sdk.buildDistributeCreatorFeesInstructions(route.mint, { payer: route.payout });
  return r.instructions;
}

// Spike 2 (read-only): find a live pump.fun coin, read its creator, creator vault balance,
// and simulate the collect instructions with the creator as fee payer. Nothing is signed or sent.
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { createRequire } from 'node:module';
const pump = createRequire(import.meta.url)('@pump-fun/pump-sdk');
const { OnlinePumpSdk, hasCoinCreatorMigratedToSharingConfig } = pump;
const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const conn = new Connection(RPC, 'confirmed');
const sdk = new OnlinePumpSdk(conn);
let mint = process.argv[2];
if (!mint) {
  const s = await fetch('https://api.dexscreener.com/latest/dex/search?q=pump%20sol').then(r => r.json());
  const p = s.pairs.find(p => p.chainId === 'solana' && p.baseToken.address.endsWith('pump'));
  mint = p.baseToken.address; console.log('picked coin', p.baseToken.symbol, mint, 'dex', p.dexId);
}
const bc = await sdk.fetchBondingCurve(mint);
const creator = bc.creator;
console.log('creator', creator.toBase58(), 'complete(graduated)', bc.complete);
console.log('migrated to sharing config:', hasCoinCreatorMigratedToSharingConfig({ mint: new PublicKey(mint), creator }));
const bal = await sdk.getCreatorVaultBalanceBothPrograms(creator);
console.log('creator vault balance (lamports, both programs):', bal.toString());
const ixs = await sdk.collectCoinCreatorFeeInstructions(creator, creator);
console.log('collect instructions:', ixs.length, ixs.map(i => i.programId.toBase58()));
const { blockhash } = await conn.getLatestBlockhash();
const msg = new TransactionMessage({ payerKey: creator, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
const sim = await conn.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true });
console.log('simulate err:', JSON.stringify(sim.value.err), 'units:', sim.value.unitsConsumed);
console.log((sim.value.logs || []).filter(l => /Instruction:|error|Error|collect/i.test(l)).slice(0, 12).join('\n'));

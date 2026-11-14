// Spike 1: list open Jupiter V1 limit buys (SOL -> mint) for one output mint, across all wallets.
// usage: node spike/list-bids.mjs <outputMint>
const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const WSOL = 'So11111111111111111111111111111111111111112';
const mint = process.argv[2] || 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
const body = { jsonrpc: '2.0', id: 1, method: 'getProgramAccounts', params: ['j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X', { encoding: 'base64', filters: [{ dataSize: 372 }, { memcmp: { offset: 40, bytes: WSOL } }, { memcmp: { offset: 72, bytes: mint } }] }] };
const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
if (r.error) { console.error(r.error); process.exit(1); }
console.log('open SOL->', mint, 'orders:', r.result.length);
for (const a of r.result.slice(0, 5)) {
  const d = Buffer.from(a.account.data[0], 'base64');
  let o = 248; o += d[o] === 1 ? 9 : 1; o += 2 + 32;
  console.log(a.pubkey, 'remaining SOL', Number(d.readBigUInt64LE(224)) / 1e9, 'created', new Date(Number(d.readBigInt64LE(o)) * 1000).toISOString());
}

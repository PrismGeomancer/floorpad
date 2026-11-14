// Spike 3: price by contract address from DexScreener (keyless).
const ca = process.argv[2] || 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
const pairs = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${ca}`).then(r => r.json());
const sol = pairs.filter(p => p.quoteToken.address === 'So11111111111111111111111111111111111111112').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
console.log(sol[0] ? { pair: sol[0].pairAddress, dex: sol[0].dexId, priceSol: sol[0].priceNative, priceUsd: sol[0].priceUsd } : 'no SOL pair');

// Minimal JSON-RPC client with retries. Never logs the URL (it can hold an API key).
export function rpcUrl(env = process.env) {
  if (env.RPC_URL) return env.RPC_URL;
  if (env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
  return 'https://api.mainnet-beta.solana.com';
}

export async function rpc(url, method, params, { tries = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      if (res.status === 429 || res.status >= 500) throw new Error(`rpc ${method}: HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(`rpc ${method}: ${j.error.message ?? JSON.stringify(j.error)}`);
      return j.result;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

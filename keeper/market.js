#!/usr/bin/env node
// Floors on Solana: read every open Jupiter limit buy paid in SOL (on-chain V1 orders),
// price the coins on DexScreener, and write data/market.json for the site.
// Read-only. Never signs, never sends. Safe to run as often as the APIs allow.
//
//   node keeper/market.js            one scan
//   MARKET_LOOP=180 node keeper/market.js   scan every 180 s (local preview)
import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { loadConfig, ROOT } from './lib/config.js';
import { rpcUrl, rpc } from './lib/rpc.js';
import { decodeOrder, LIMIT_ORDER_PROGRAM, ORDER_SIZE, WSOL } from './lib/orders.js';
import { pickSolPair } from './lib/price.js';
import { summarizeMarket, pickFeatured, EXCLUDED_MINTS } from './lib/market.js';

const DATA = process.env.DATA_DIR ? `${process.env.DATA_DIR.replace(/\/$/, '')}/` : `${ROOT}data/`;
const log = (...a) => console.log('[market]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function allSolOrders(url) {
  const res = await rpc(url, 'getProgramAccounts', [LIMIT_ORDER_PROGRAM, {
    encoding: 'base64',
    filters: [{ dataSize: ORDER_SIZE }, { memcmp: { offset: 40, bytes: WSOL } }],
  }]);
  const out = [];
  for (const a of res) { try { out.push(decodeOrder(a.pubkey, Buffer.from(a.account.data[0], 'base64'))); } catch { /* skip malformed */ } }
  return out;
}

async function decimalsFor(url, mints) {
  const out = {};
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const res = await rpc(url, 'getMultipleAccounts', [batch, { encoding: 'jsonParsed' }]);
    res.value.forEach((v, j) => { const d = v?.data?.parsed?.info?.decimals; if (Number.isInteger(d)) out[batch[j]] = d; });
  }
  return out;
}

async function pricesFor(mints) {
  const out = {};
  const usdOnly = {};
  let solUsd = null;
  for (let i = 0; i < mints.length; i += 30) {
    const batch = mints.slice(i, i + 30);
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(',')}`);
    if (!res.ok) { log(`dexscreener HTTP ${res.status}`); continue; }
    const pairs = await res.json();
    for (const x of pairs) if (!solUsd && x?.quoteToken?.address === WSOL && Number(x.priceUsd) > 0 && Number(x.priceNative) > 0 && (x.liquidity?.usd ?? 0) > 50_000) solUsd = Number(x.priceUsd) / Number(x.priceNative);
    for (const m of batch) {
      const mine = pairs.filter((p) => p?.baseToken?.address === m);
      let p = pickSolPair(mine);
      if (!p) {
        // No SOL pair: keep the deepest USD-priced pair and convert at the SOL price below.
        const u = mine.filter((x) => Number(x.priceUsd) > 0).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        if (u) usdOnly[m] = u;
        continue;
      }
      const best = mine.find((x) => x.pairAddress === p.pair);
      const img = best?.info?.imageUrl;
      out[m] = {
        ...p,
        symbol: String(best?.baseToken?.symbol ?? '').slice(0, 16),
        name: String(best?.baseToken?.name ?? '').slice(0, 40),
        image: typeof img === 'string' && /^https:\/\/cdn\.dexscreener\.com\//.test(img) ? img : null,
        change24h: Number(best?.priceChange?.h24) || 0,
      };
    }
    await sleep(250);
  }
  if (solUsd) {
    for (const [m, u] of Object.entries(usdOnly)) {
      const img = u?.info?.imageUrl;
      out[m] = {
        priceSol: Number(u.priceUsd) / solUsd, priceUsd: Number(u.priceUsd), pair: u.pairAddress, dex: u.dexId, viaUsd: true,
        symbol: String(u.baseToken?.symbol ?? '').slice(0, 16), name: String(u.baseToken?.name ?? '').slice(0, 40),
        image: typeof img === 'string' && /^https:\/\/cdn\.dexscreener\.com\//.test(img) ? img : null,
        change24h: Number(u.priceChange?.h24) || 0,
      };
    }
  }
  return out;
}

/** Real token icons from Jupiter's token list, for coins DexScreener has no image for. */
const ICON_OK = /^https:\/\/[\w.-]+\/[^\s"'<>]+$/;
async function jupiterIcons(mints) {
  const out = {};
  for (let i = 0; i < mints.length; i += 50) {
    try {
      const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mints.slice(i, i + 50).join(',')}`);
      if (!res.ok) continue;
      for (const t of await res.json()) {
        if (typeof t?.icon === 'string' && ICON_OK.test(t.icon) && t.icon.length < 400) out[t.id] = { icon: t.icon, symbol: String(t.symbol ?? '').trim().slice(0, 16) };
      }
    } catch { /* icons are optional */ }
  }
  return out;
}

/** 24h of 15-minute closes in SOL from GeckoTerminal; dropped if it disagrees with DexScreener. */
async function spark(pool, ref, currency = 'token') {
  try {
    const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute?aggregate=15&limit=96&currency=${currency}&token=base`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const list = (await res.json())?.data?.attributes?.ohlcv_list ?? [];
    const pts = list.map((c) => [c[0], c[4]]).filter(([t, c]) => t > 0 && c > 0).sort((a, b) => a[0] - b[0]);
    if (pts.length < 4) return null;
    const last = pts.at(-1)[1];
    if (Math.abs(last / ref - 1) > 0.2) return null; // wrong side of the pool, or stale
    return pts.map(([t, c]) => [t, Number(c.toPrecision(6))]);
  } catch { return null; }
}

async function scan() {
  const cfg = loadConfig(process.env.FLOORPAD_CONFIG || undefined);
  const url = rpcUrl();
  const nowSec = Math.floor(Date.now() / 1000);
  const orders = (await allSolOrders(url)).filter((o) => o.making > 0n && !(o.expiredAt !== null && o.expiredAt <= nowSec) && !EXCLUDED_MINTS.has(o.outputMint));
  log(`open SOL limit buys: ${orders.length}`);

  // Price the coins with the most SOL resting, plus the coins behind the newest bids.
  const solBy = new Map();
  for (const o of orders) solBy.set(o.outputMint, (solBy.get(o.outputMint) ?? 0) + Number(o.making) / 1e9);
  const top = [...solBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 90).map(([m]) => m);
  const newest = [...orders].sort((a, b) => b.createdAt - a.createdAt).filter((o) => Number(o.making) / 1e9 >= cfg.minBidSol).slice(0, 30).map((o) => o.outputMint);
  const mints = [...new Set([...top, ...newest])];
  const [decimals, prices, icons] = await Promise.all([decimalsFor(url, mints), pricesFor(mints), jupiterIcons(mints)]);
  for (const [m, p] of Object.entries(prices)) {
    p.symbol = p.symbol.trim() || icons[m]?.symbol || '';
    if (!p.image && icons[m]) p.image = icons[m].icon;
  }
  log(`priced ${Object.keys(prices).length} of ${mints.length} coins, ${Object.values(prices).filter((p) => p.image).length} with logos`);

  const market = summarizeMarket({ orders, decimals, prices, cfg, nowSec });

  for (const c of market.coins.slice(0, 10)) {
    // USD-priced coins: same shape, scaled to SOL at today's rate so the chart's % maths holds.
    if (c.viaUsd) {
      const s = await spark(c.pair, c.priceUsd, 'usd');
      const k = c.priceSol / c.priceUsd;
      c.spark = s ? s.map(([t, v]) => [t, Number((v * k).toPrecision(6))]) : null;
    } else c.spark = await spark(c.pair, c.priceSol);
    await sleep(2200); // GeckoTerminal allows about 30 calls a minute
  }
  market.featured = pickFeatured(market.coins);

  mkdirSync(DATA, { recursive: true });
  writeFileSync(`${DATA}market.json.tmp`, JSON.stringify(market) + '\n');
  renameSync(`${DATA}market.json.tmp`, `${DATA}market.json`);
  log(`wrote market.json: ${market.coins.length} floors, ${market.tape.length} recent bids, ${market.totals.inRangeSol} SOL within ${cfg.rangePct}%`);
}

const loop = Number(process.env.MARKET_LOOP || 0);
do {
  try { await scan(); } catch (e) { console.error('[market] FAILED:', e.message); if (!loop) process.exitCode = 1; }
  if (loop) await sleep(loop * 1000);
} while (loop);

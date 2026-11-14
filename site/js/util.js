// DOM + formatting helpers. Text from JSON only ever goes in through textContent.

/** el('a', {href, class}, ['text', childNode]) — attributes set via setAttribute, children as text nodes. */
export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = String(v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const $ = (s, root = document) => root.querySelector(s);
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SAFE_IMG = /^https:\/\/[\w.-]+\/[^\s"'<>]+$/;
/** A coin's real logo. Falls back to its initial on a dark disc if the image is missing or fails. */
export function coinLogo(urls, symbol, size = 32) {
  const fallback = () => el('span', { class: 'coin-fallback', 'aria-hidden': 'true', style: `width:${size}px;height:${size}px`, text: String(symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase() });
  // Try the small proxied logo first, then the original, then the coin's initial.
  const list = [].concat(urls).filter((u) => typeof u === 'string' && SAFE_IMG.test(u));
  if (!list.length) return fallback();
  const img = el('img', { class: 'coin', src: list[0], alt: '', width: size, height: size, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  let k = 0;
  img.addEventListener('error', () => { k += 1; if (k < list.length) img.src = list[k]; else img.replaceWith(fallback()); });
  return img;
}

/**
 * A small mark for a wallet, drawn from its address: three bars of different
 * lengths and greens, like the logo's floor. Same address, same mark.
 */
export function walletMark(addr, size = 18) {
  let h = 2166136261;
  for (let i = 0; i < addr.length; i++) { h ^= addr.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const greens = ['#22c55e', '#16a34a', '#0f7a37', '#4ade80', '#86efac'];
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 18 18');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', 'idn');
  svg.setAttribute('aria-hidden', 'true');
  const bg = document.createElementNS(NS, 'rect');
  Object.entries({ width: 18, height: 18, rx: 5, fill: '#06150d' }).forEach(([k, v]) => bg.setAttribute(k, v));
  svg.append(bg);
  for (let i = 0; i < 3; i++) {
    const w = 6 + ((h >>> (i * 4)) & 7);
    const r = document.createElementNS(NS, 'rect');
    Object.entries({ x: (18 - w) / 2, y: 4 + i * 4, width: w, height: 2.4, rx: 1.2, fill: greens[(h >>> (12 + i * 3)) % greens.length] }).forEach(([k, v]) => r.setAttribute(k, v));
    svg.append(r);
  }
  return svg;
}

const B58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58len(s) {
  let x = 0n;
  for (const c of s) x = x * 58n + BigInt(A.indexOf(c));
  let len = 0;
  while (x > 0n) { x >>= 8n; len++; }
  for (const c of s) { if (c === '1') len++; else break; }
  return len;
}
/** A Solana address is base58 that decodes to exactly 32 bytes. */
export function isAddress(s) {
  return typeof s === 'string' && s.length >= 32 && s.length <= 44 && B58.test(s) && b58len(s) === 32;
}
/** A transaction signature is base58 that decodes to 64 bytes. */
export function isSignature(s) {
  return typeof s === 'string' && s.length >= 64 && s.length <= 90 && B58.test(s) && b58len(s) === 64;
}

export const short = (a) => (typeof a === 'string' && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : String(a ?? ''));

export function sol(x) {
  const n = Number(x) || 0;
  if (n === 0) return '0';
  const a = Math.abs(n);
  const d = a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
}
/** Prices in SOL can be tiny: keep 4 significant digits, no exponent. */
export function price(x) {
  const n = Number(x) || 0;
  if (n === 0) return '0';
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const d = Math.min(12, Math.max(2, 3 - Math.floor(Math.log10(n))));
  return n.toFixed(d).replace(/0+$/, '');
}

/** "3m ago" from a unix-seconds or ISO time, using the copy deck's words. */
export function ago(t, words) {
  const ms = typeof t === 'number' ? t * 1000 : Date.parse(t);
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const f = (k, n) => words[k].replace('{n}', String(n));
  if (s < 10) return words.now;
  if (s < 60) return f('s', s);
  if (s < 3600) return f('m', Math.floor(s / 60));
  if (s < 172800) return f('h', Math.floor(s / 3600));
  return f('d', Math.floor(s / 86400));
}

export const pct = (x, d = 1) => (Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const mult = (x) => `${Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export const int = (x) => (Number(x) || 0).toLocaleString('en-US');

export function duration(min) {
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function timeShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

export const solscanTx = (sig) => `https://solscan.io/tx/${encodeURIComponent(sig)}`;
export const solscanAccount = (a) => `https://solscan.io/account/${encodeURIComponent(a)}`;

/** Count a number up once. Skipped under reduced motion. */
export function countUp(node, to, format) {
  if (reducedMotion() || !(to > 0)) { node.textContent = format(to); return; }
  const start = performance.now();
  const dur = 700;
  const step = (t) => {
    const k = Math.min(1, (t - start) / dur);
    const e = 1 - (1 - k) ** 3;
    node.textContent = format(to * e);
    if (k < 1) requestAnimationFrame(step);
    else node.textContent = format(to);
  };
  requestAnimationFrame(step);
}

let toastTimer;
export function toast(text) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = el('div', { class: 'toast', text });
  box.append(t);
  clearTimeout(toastTimer);
  setTimeout(() => t.remove(), 2600);
}

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: fine */ } },
};

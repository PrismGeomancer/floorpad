import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spanMinutes } from '../../site/js/rules.js';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function loadConfig(path = `${ROOT}config.json`) {
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  validateConfig(cfg);
  return cfg;
}

export function validateConfig(cfg) {
  const must = (ok, msg) => { if (!ok) throw new Error(`config.json: ${msg}`); };
  must(cfg.roundMinutes > 0, 'roundMinutes must be > 0');
  must(cfg.rangePct > 0, 'rangePct must be > 0');
  must(Array.isArray(cfg.distanceBands) && cfg.distanceBands.length > 0, 'distanceBands missing');
  let last = 0;
  for (const [upTo, m] of cfg.distanceBands) { must(upTo > last && m >= 0, 'distanceBands must ascend'); last = upTo; }
  must(last === cfg.rangePct, 'last distance band must equal rangePct');
  must(Array.isArray(cfg.ageBands) && cfg.ageBands.length > 0, 'ageBands missing');
  let lastAge = -1;
  for (const [span, m] of cfg.ageBands) { const v = spanMinutes(span, cfg.roundMinutes); must(v > lastAge && m >= 0, 'ageBands must ascend'); lastAge = v; }
  must(cfg.minBidSol > 0, 'minBidSol must be > 0');
  must(cfg.sendThresholdSol >= 0.00089088, 'sendThresholdSol must be at least the rent-exempt minimum (0.00089088 SOL)');
}

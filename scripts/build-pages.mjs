// Assemble the GitHub Pages artifact: site/ + data/ → _site/
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const out = new URL('_site/', root);
execFileSync(process.execPath, [fileURLToPath(new URL('scripts/sync-config.mjs', root))], { stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
cpSync(new URL('site/', root), out, { recursive: true });
mkdirSync(new URL('data/', out), { recursive: true });
for (const f of ['round.json', 'payouts.json', 'carry.json', 'market.json']) {
  const src = new URL(`data/${f}`, root);
  if (existsSync(src)) cpSync(src, new URL(`data/${f}`, out));
}
console.log('_site/ ready');

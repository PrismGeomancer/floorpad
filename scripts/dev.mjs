// Local preview with live data: the static server plus a market scan every 3 minutes.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = (file, env) => spawn(process.execPath, [file], { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
const kids = [run('scripts/serve.mjs'), run('keeper/market.js', { MARKET_LOOP: process.env.MARKET_LOOP || '180' })];
const stop = () => { for (const k of kids) k.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

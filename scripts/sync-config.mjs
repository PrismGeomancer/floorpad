// Generate site/config.js from config.json so the site and keeper never disagree.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const cfg = JSON.parse(readFileSync(new URL('config.json', root), 'utf8'));
const out = `// Generated from config.json by \`npm run sync-config\`. Edit config.json, not this file.\nexport default Object.freeze(${JSON.stringify(cfg, null, 2)});\n`;
writeFileSync(new URL('site/config.js', root), out);
console.log('site/config.js written');

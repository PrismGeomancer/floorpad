// Spike: fetch one Jupiter limit-order (Trigger V1) account and dump raw fields.
const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(buf){let x=BigInt('0x'+(Buffer.from(buf).toString('hex')||'0'));let s='';while(x>0n){s=ALPH[Number(x%58n)]+s;x/=58n;}for(const b of buf){if(b===0)s='1'+s;else break;}return s;}
const pk = process.argv[2];
const r = await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',params:[pk,{encoding:'base64'}]})}).then(r=>r.json());
const d = Buffer.from(r.result.value.data[0],'base64');
console.log('len',d.length);
for (let o=8;o<8+32*7;o+=32) console.log('pk@'+o, b58(d.subarray(o,o+32)));
for (let o=232;o<d.length-7;o+=8) console.log('u64@'+o, d.readBigUInt64LE(o).toString(), ' i64:', d.readBigInt64LE(o).toString());

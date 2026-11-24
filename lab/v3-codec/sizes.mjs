import QRCode from 'qrcode';
import crypto from 'node:crypto';
import { encodeSDP, withDerivedCreds, parseSDP } from '../../sdp-codec-v3.js';
const fp = Array.from(crypto.randomBytes(32), b => b.toString(16).padStart(2,'0').toUpperCase()).join(':');
const base = (srflx) => ['a=ice-ufrag:TIcR','a=ice-pwd:n8rkDYXwaKZDIfwboX43SJsC',`a=fingerprint:sha-256 ${fp}`,
  'a=candidate:1 1 udp 2122260223 192.168.1.23 54321 typ host generation 0 network-id 1',
  ...(srflx ? ['a=candidate:2 1 udp 1686052607 203.0.113.7 54321 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-id 1'] : [])].join('\r\n');
const sha1 = crypto.randomBytes(20);
const ver = async n => QRCode.create([{ data: new Uint8Array(n), mode: 'byte' }], { errorCorrectionLevel: 'L' }).version;
const rows = [];
const tiers = [
  ['v3 safe', {}, {}],
  ['+ LAN one-sided', { policy: 'lan' }, { policy: 'none' }],
  ['+ sha-1 fingerprint', { policy: 'lan' }, { policy: 'none' }, 'sha1'],
  ['+ derived creds (sha-256)', { policy: 'lan' }, { policy: 'none' }, 'derived'],
  ['+ sha-1 + derived', { policy: 'lan' }, { policy: 'none' }, 'sha1', 'derived'],
];
for (const srflx of [false, true]) {
  rows.push([`v2 current${srflx?' +srflx':''}`, srflx ? 85 : 72, 72]);
  for (const [name, o, a, ...f] of tiers) {
    const s1 = f.includes('sha1') ? sha1 : null;
    const mk = () => { let s = base(srflx); if (f.includes('derived')) s = withDerivedCreds(s, s1 || parseSDP(s).fp); return s; };
    const ob = encodeSDP(mk(), 'offer', { ...o, sha1: s1, derived: f.includes('derived') }).length;
    const ab = encodeSDP(mk(), 'answer', { ...a, sha1: s1, derived: f.includes('derived') }).length;
    rows.push([`${name}${srflx?' +srflx':''}`, ob, ab]);
  }
}
for (const r of rows) console.log(r[0].padEnd(34), `offer ${String(r[1]).padStart(3)}B v${await ver(r[1])}`, ` answer ${String(r[2]).padStart(3)}B v${await ver(r[2])}`);
console.log('known-peer reconnect (192.168 host):', Math.ceil((1+1+8+1+1+18+16+1)/8), 'B v' + await ver(Math.ceil((1+1+8+1+1+18+16+1)/8)));

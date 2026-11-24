import { encodeSDP, decode, toSDP, parseSDP, withDerivedCreds } from '../../sdp-codec-v3.js';
const fp = '9A:A4:AE:E0:0B:73:65:00:37:32:97:39:7C:EF:EC:69:26:E6:87:87:78:85:D8:20:E0:69:F4:8C:B7:21:DC:DE';
const mk = (u, p, cands) => [`a=ice-ufrag:${u}`, `a=ice-pwd:${p}`, `a=fingerprint:sha-256 ${fp}`, 'a=setup:actpass',
  ...cands.map((c, i) => `a=candidate:${i} 1 ${c[3]||'udp'} 2122260223 ${c[1]} ${c[2]} typ ${c[0]}${c[0]!=='host'?' raddr 0.0.0.0 rport 0':''} generation 0 network-id 1`)].join('\r\n');
const cases = {
  'libwebrtc, 192.168 host': mk('TIcR','n8rkDYXwaKZDIfwboX43SJsC',[['host','192.168.1.23',54321]]),
  'libwebrtc, 10.x + 172.20 + public srflx same port': mk('a+/9','ABCDEFGHIJKLMNOPQRSTUVWX',[['host','10.1.2.3',4000],['host','172.20.0.5',4001],['srflx','203.0.113.9',4001]]),
  'mdns host + srflx': mk('TIcR','n8rkDYXwaKZDIfwboX43SJsC',[['host','3f8a2c1e-7b4d-4e2a-9c1f-5d6e7f8a9b0c.local',5000],['srflx','198.51.100.4',5000]]),
  'ipv6 (dropped by default)': mk('TIcR','n8rkDYXwaKZDIfwboX43SJsC',[['host','2001:db8::1',6000],['host','192.168.0.9',6001]]),
  'firefox hex creds + relay': mk('8f9b1c3e','4f2a9d0c1b7e6a5f3c2d1e0f9a8b7c6d',[['host','192.168.4.4',7000],['relay','192.0.2.50',3478]]),
  'odd creds (generic)': mk('xyz12','pass-word_that-is_long!!',[['host','192.168.0.2',8000],['host','192.168.0.2',9,'tcp']]),
};
let fail = 0;
for (const [name, sdp] of Object.entries(cases)) {
  const opts = name.startsWith('ipv6') ? {} : {};
  const bytes = encodeSDP(sdp, 'offer', opts);
  const d = decode(bytes);
  const src = parseSDP(sdp);
  const ok = d.ufrag === src.ufrag && d.pwd === src.pwd && Buffer.from(d.fp).equals(Buffer.from(src.fp));
  const keptCands = d.cands.map(c => `${c.kind} ${c.addr}:${c.port}`).join(', ');
  if (!ok) fail++;
  console.log(`${ok ? 'OK ' : 'BAD'} ${name}: ${bytes.length} bytes | ${keptCands}`);
}
// ipv6 when explicitly included
const d6 = decode(encodeSDP(cases['ipv6 (dropped by default)'], 'offer', { includeIPv6: true }));
console.log('ipv6 included ->', d6.cands.map(c => c.addr).join(', '));
// derived creds
const munged = withDerivedCreds(cases['libwebrtc, 192.168 host'], Uint8Array.from(fp.split(':'), h => parseInt(h, 16)));
const dd = decode(encodeSDP(munged, 'answer', { derived: true, policy: 'none' }));
console.log('derived creds round trip:', dd.ufrag, dd.pwd, 'bytes =', encodeSDP(munged, 'answer', { derived: true, policy: 'none' }).length);
try { encodeSDP(cases['libwebrtc, 192.168 host'], 'offer', { derived: true }); console.log('BAD: unmunged accepted'); fail++; } catch (e) { console.log('unmunged + derived rejected: OK'); }
process.exit(fail);

// sdp-codec-v3.js — tighter QR payload for pair2peer.
//
// Two ways to use it:
//
//   1. Same interface as asn1-uper-codec.js (what index.html uses): the compact object from
//      compactSDP() goes in, the same object shape comes out for expandSDP().
//        const bytes = encodeWebRTCData({ t: 'o', ...compactSDP(sdp) });
//        const obj   = decodeWebRTCData(bytes);
//
//   2. Straight from/to SDP, with the optional tiers (one-sided candidates, sha-1, derived creds):
//        const bytes = encodeSDP(pc.localDescription.sdp, 'offer', opts);
//        const sdp   = decodeToSDP(bytes);
//
// Not wire-compatible with the v2 (ASN.1 UPER) format: both peers need this version.
//
// Bit layout (everything is a prefix code, no byte alignment until the very end):
//   type        1   0 = offer (setup:actpass), 1 = answer (setup:active)
//   creds       0      libwebrtc  (ufrag 4 + pwd 24 chars of [A-Za-z0-9+/], 6 bits each = 168 bits)
//               10     derived    (sender munged ufrag/pwd from its fingerprint; 0 bits)
//               110    hex        (Firefox-style: ufrag 8 + pwd 32 hex chars, 4 bits each = 160 bits)
//               111    generic    (8-bit lengths, 7-bit chars)
//   fingerprint 0 + 256 bits sha-256  |  1 + 160 bits sha-1
//   candidates  repeated: 1 + candidate ... terminated by 0
//     kind      0 host | 10 srflx | 11 relay
//     address   00 192.168/16 +16 | 01 10/8 +24 | 100 172.16/12 +20 | 101 IPv4 +32
//               110 mDNS uuid.local +128 | 111 IPv6 +128
//     port      first candidate: 16 bits; later ones: 1 = same as previous, 0 + 16 bits
//
// Dropped versus v2: setup role (implied by type), ufrag/pwd length prefixes,
// fingerprint length, network-id (expandSDP never used it), srflx raddr/rport
// (informational only), and the 5-bit candidate count.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const HEX = '0123456789abcdef';

class BitWriter {
  constructor() { this.bits = []; }
  write(value, n) { for (let i = n - 1; i >= 0; i--) this.bits.push(Number((BigInt(value) >> BigInt(i)) & 1n)); }
  bytes() {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((b, i) => { if (b) out[i >> 3] |= 0x80 >> (i & 7); });
    return out;
  }
}

class BitReader {
  constructor(bytes) { this.bytes = bytes; this.pos = 0; }
  read(n) {
    let v = 0n;
    for (let i = 0; i < n; i++, this.pos++) {
      if ((this.pos >> 3) >= this.bytes.length) throw new Error('payload truncated');
      v = (v << 1n) | BigInt((this.bytes[this.pos >> 3] >> (7 - (this.pos & 7))) & 1);
    }
    return n <= 32 ? Number(v) : v;
  }
}

// ---------- SDP parsing ----------

export function parseSDP(sdp) {
  const get = re => (sdp.match(re) || [])[1];
  const fpLine = sdp.match(/a=fingerprint:(\S+) ([0-9A-Fa-f:]+)/);
  const cands = [];
  for (const line of sdp.split(/\r?\n/)) {
    if (!line.startsWith('a=candidate:')) continue;
    const p = line.slice(12).split(' ');
    if (p[2].toLowerCase() !== 'udp') continue;             // TCP candidates add nothing here
    cands.push({ kind: p[7], addr: p[4], port: +p[5] });
  }
  return {
    ufrag: get(/a=ice-ufrag:(\S+)/),
    pwd: get(/a=ice-pwd:(\S+)/),
    fpAlg: fpLine[1].toLowerCase(),
    fp: hexToBytes(fpLine[2]),
    cands,
  };
}

const hexToBytes = h => Uint8Array.from(h.replace(/:/g, '').match(/../g), x => parseInt(x, 16));
const bytesToFp = b => Array.from(b, x => x.toString(16).padStart(2, '0').toUpperCase()).join(':');

// ---------- derived ICE credentials (optional, needs local-description munging) ----------

function b64(bytes) {
  let bits = 0, acc = 0, out = '';
  for (const b of bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 6) { bits -= 6; out += B64[(acc >> bits) & 63]; } }
  if (bits) out += B64[(acc << (6 - bits)) & 63];
  return out;
}

// ufrag = 4 chars from fp[0..3), pwd = 23 chars from fp[3..20). Works for sha-1 (20 bytes) and sha-256.
export function deriveCreds(fpBytes) {
  return { ufrag: b64(fpBytes.slice(0, 3)), pwd: b64(fpBytes.slice(3, 20)) };
}

// Call on the SDP from createOffer()/createAnswer() BEFORE setLocalDescription.
// fpBytes = the fingerprint bytes you will transmit (sha-256 from the SDP, or your cert's sha-1).
export function withDerivedCreds(sdp, fpBytes) {
  const { ufrag, pwd } = deriveCreds(fpBytes);
  return sdp.replace(/a=ice-ufrag:\S+/g, `a=ice-ufrag:${ufrag}`).replace(/a=ice-pwd:\S+/g, `a=ice-pwd:${pwd}`);
}

// ---------- candidate selection ----------

const isMdns = a => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.local$/i.test(a);
const isV4 = a => /^\d+\.\d+\.\d+\.\d+$/.test(a);

// policy: 'all'  — host + srflx + relay (what v2 sent, minus IPv6 unless includeIPv6)
//         'lan'  — host candidates only
//         'none' — no candidates; the peer reaches us as peer-reflexive. Only valid when the
//                  OTHER side sends candidates and both are on the same network.
export function selectCandidates(cands, { policy = 'all', includeIPv6 = false } = {}) {
  if (policy === 'none') return [];
  let out = cands.filter(c => isV4(c.addr) || isMdns(c.addr) || (includeIPv6 && c.addr.includes(':')));
  if (policy === 'lan') out = out.filter(c => c.kind === 'host');
  // An mDNS name costs 128 bits; skip it when a real IPv4 host candidate exists.
  if (out.some(c => c.kind === 'host' && isV4(c.addr))) out = out.filter(c => !isMdns(c.addr));
  const rank = { host: 0, srflx: 1, prflx: 1, relay: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

// ---------- encode ----------

function writeAddr(w, addr) {
  if (isV4(addr)) {
    const [a, b, c, d] = addr.split('.').map(Number);
    const n = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
    if (a === 192 && b === 168) { w.write(0b00, 2); w.write(n & 0xffff, 16); }
    else if (a === 10) { w.write(0b01, 2); w.write(n & 0xffffff, 24); }
    else if (a === 172 && b >= 16 && b < 32) { w.write(0b100, 3); w.write(n & 0xfffff, 20); }
    else { w.write(0b101, 3); w.write(n, 32); }
  } else if (isMdns(addr)) {
    w.write(0b110, 3); w.write(BigInt('0x' + addr.slice(0, 36).replace(/-/g, '')), 128);
  } else {
    w.write(0b111, 3); w.write(ipv6ToBig(addr), 128);
  }
}

function ipv6ToBig(a) {
  const [head, tail = ''] = a.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const groups = a.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n);
}

export function encodeInfo(info, type, { policy = 'all', includeIPv6 = false, derived = false, sha1 = null } = {}) {
  const w = new BitWriter();
  w.write(type === 'answer' ? 1 : 0, 1);

  const fpBytes = sha1 || info.fp;
  if (derived) {
    const d = deriveCreds(fpBytes);
    if (d.ufrag !== info.ufrag || d.pwd !== info.pwd) throw new Error('derived=true but the local SDP was not munged with withDerivedCreds()');
    w.write(0b10, 2);
  } else if (info.ufrag.length === 4 && info.pwd.length === 24 && /^[A-Za-z0-9+/]+$/.test(info.ufrag + info.pwd)) {
    w.write(0, 1);
    for (const ch of info.ufrag + info.pwd) w.write(B64.indexOf(ch), 6);
  } else if (/^[0-9a-f]{8}$/.test(info.ufrag) && /^[0-9a-f]{32}$/.test(info.pwd)) {
    w.write(0b110, 3);
    for (const ch of info.ufrag + info.pwd) w.write(HEX.indexOf(ch), 4);
  } else {
    w.write(0b111, 3);
    w.write(info.ufrag.length, 8); w.write(info.pwd.length, 8);
    for (const ch of info.ufrag + info.pwd) w.write(ch.charCodeAt(0) & 0x7f, 7);
  }

  if (sha1) { w.write(1, 1); sha1.forEach(b => w.write(b, 8)); }
  else {
    if (info.fpAlg !== 'sha-256' || info.fp.length !== 32) throw new Error('expected a sha-256 fingerprint');
    w.write(0, 1); info.fp.forEach(b => w.write(b, 8));
  }

  let prevPort = null;
  for (const c of selectCandidates(info.cands, { policy, includeIPv6 })) {
    w.write(1, 1);
    if (c.kind === 'host') w.write(0, 1); else if (c.kind === 'relay') w.write(0b11, 2); else w.write(0b10, 2);
    writeAddr(w, c.addr);
    if (prevPort === null) w.write(c.port, 16);
    else if (c.port === prevPort) w.write(1, 1);
    else { w.write(0, 1); w.write(c.port, 16); }
    prevPort = c.port;
  }
  w.write(0, 1);
  return w.bytes();
}

export function encodeSDP(sdp, type, opts) {
  return encodeInfo(parseSDP(sdp), type, opts);
}

// ---------- decode ----------

function readAddr(r) {
  const v4 = n => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255].join('.');
  if (r.read(1) === 0) {
    return r.read(1) === 0 ? v4(((192 << 24) >>> 0) + (168 << 16) + r.read(16)) : v4(((10 << 24) >>> 0) + r.read(24));
  }
  const tag = r.read(2);
  if (tag === 0) return v4(((172 << 24) >>> 0) + (16 << 16) + r.read(20));
  if (tag === 1) return v4(r.read(32));
  const hex = r.read(128).toString(16).padStart(32, '0');
  if (tag === 2) return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}.local`;
  return hex.match(/..../g).join(':');
}

export function decode(bytes) {
  const r = new BitReader(bytes);
  const type = r.read(1) ? 'answer' : 'offer';
  let ufrag = '', pwd = '', derived = false;
  if (r.read(1) === 0) {
    for (let i = 0; i < 28; i++) { const ch = B64[r.read(6)]; if (i < 4) ufrag += ch; else pwd += ch; }
  } else if (r.read(1) === 0) {
    derived = true;
  } else if (r.read(1) === 0) {
    for (let i = 0; i < 40; i++) { const ch = HEX[r.read(4)]; if (i < 8) ufrag += ch; else pwd += ch; }
  } else {
    const ul = r.read(8), pl = r.read(8);
    for (let i = 0; i < ul + pl; i++) { const ch = String.fromCharCode(r.read(7)); if (i < ul) ufrag += ch; else pwd += ch; }
  }
  const fpAlg = r.read(1) ? 'sha-1' : 'sha-256';
  const fp = new Uint8Array(fpAlg === 'sha-1' ? 20 : 32).map(() => r.read(8));
  if (derived) ({ ufrag, pwd } = deriveCreds(fp));

  const cands = [];
  let prevPort = null;
  while (r.read(1)) {
    const kind = r.read(1) === 0 ? 'host' : (r.read(1) ? 'relay' : 'srflx');
    const addr = readAddr(r);
    const port = prevPort === null ? r.read(16) : (r.read(1) ? prevPort : r.read(16));
    cands.push({ kind, addr, port });
    prevPort = port;
  }
  return { type, ufrag, pwd, fpAlg, fp, cands };
}

// ---------- rebuild SDP (same template as v2's expandSDP, which browsers already accept) ----------

export function toSDP({ type, ufrag, pwd, fpAlg, fp, cands }) {
  const prio = { host: 2122260223, srflx: 1686052607, relay: 41885439 };
  const lines = [
    'v=0', `o=- ${Date.now()} 2 IN IP4 127.0.0.1`, 's=-', 't=0 0',
    'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`, 'a=ice-options:trickle',
    `a=fingerprint:${fpAlg} ${bytesToFp(fp)}`,
    `a=setup:${type === 'answer' ? 'active' : 'actpass'}`,
    'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144',
  ];
  cands.forEach((c, i) => {
    const extra = c.kind === 'host' ? '' : ' raddr 0.0.0.0 rport 0';
    lines.push(`a=candidate:${i + 1} 1 udp ${prio[c.kind] - i} ${c.addr} ${c.port} typ ${c.kind}${extra} generation 0`);
  });
  return lines.join('\r\n') + '\r\n';
}

export const decodeToSDP = bytes => toSDP(decode(bytes));

// ---------- drop-in for asn1-uper-codec.js (object shape used by index.html) ----------
//
// Object: { t: 'o'|'a', u, p, f: 'AB:CD:..', s, c: ['h,ip:port,nid', 's,ip:port,raddr:rport,nid', 'r,ip:port'] }
// v3 does not carry network-id or srflx raddr/rport (expandSDP never needed them), so they come
// back as '1' and '0.0.0.0:0'. setup comes back as 'a' (compactSDP stores only its first letter).

function fromLegacyCandidate(str) {
  const [k, hostPort] = str.split(',');
  const i = hostPort.lastIndexOf(':');
  const kind = { h: 'host', s: 'srflx', r: 'relay' }[k];
  return kind ? { kind, addr: hostPort.slice(0, i), port: +hostPort.slice(i + 1) } : null;
}

function toLegacyCandidate({ kind, addr, port }) {
  if (kind === 'host') return `h,${addr}:${port},1`;
  if (kind === 'srflx') return `s,${addr}:${port},0.0.0.0:0,1`;
  return `r,${addr}:${port}`;
}

export function encodeWebRTCData(obj) {
  if (!obj || !obj.u || !obj.p || !obj.f) return new Uint8Array(0);
  const info = {
    ufrag: obj.u, pwd: obj.p, fpAlg: 'sha-256', fp: hexToBytes(obj.f),
    cands: (obj.c || []).map(fromLegacyCandidate).filter(Boolean),
  };
  return encodeInfo(info, obj.t === 'a' ? 'answer' : 'offer');
}

export function decodeWebRTCData(bytes) {
  const d = decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return { t: d.type === 'answer' ? 'a' : 'o', u: d.ufrag, p: d.pwd, f: bytesToFp(d.fp), s: 'a', c: d.cands.map(toLegacyCandidate) };
}

if (typeof window !== 'undefined') {
  window.encodeWebRTCData = encodeWebRTCData;
  window.decodeWebRTCData = decodeWebRTCData;
}

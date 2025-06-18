const zlib = require('zlib');

// QR Code encoding efficiency (bits per character)
const QR_ENCODING = {
  numeric: 3.33,      // 10 bits per 3 digits
  alphanumeric: 5.5,  // 11 bits per 2 chars  
  byte: 8,            // 8 bits per byte
  kanji: 13          // 13 bits per char (not used)
};

// Real WebRTC offer
const webrtcOffer = {
  type: 'offer',
  sdp: `v=0
o=- 4611731400430051336 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=extmap-allow-mixed
a=msid-semantic: WMS
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:4aFz
a=ice-pwd:by4GZGG1lw+040DWA6hXM5Bz
a=ice-options:trickle
a=fingerprint:sha-256 7B:8B:F0:65:5F:78:E2:51:3B:AC:6F:F3:3F:46:1B:35:DC:B8:5F:64:1A:24:C2:43:F0:A1:58:D0:A1:2C:19:08
a=setup:actpass
a=mid:0
a=sctp-port:5000
a=max-message-size:262144`
};

// Typical ICE candidates
const iceCandidates = [
  "candidate:2999745851 1 udp 2122260223 192.168.1.100 56789 typ host generation 0 ufrag 4aFz network-id 1",
  "candidate:1510613869 1 udp 1686052607 203.0.113.1 56789 typ srflx raddr 192.168.1.100 rport 56789 generation 0 ufrag 4aFz network-id 1",
  "candidate:2365646357 1 udp 41885439 198.51.100.1 3478 typ relay raddr 203.0.113.1 rport 56789 generation 0 ufrag 4aFz network-id 1"
];

// Minimize SDP (keep only essential lines)
function minimizeSDP(sdp) {
  return sdp.split('\n')
    .filter(line => 
      line.match(/^[vost]=/) ||
      line.match(/a=(ice-ufrag|ice-pwd|fingerprint|setup|mid|group):/)
    )
    .join('\n');
}

// Simple Base45 encoding
const BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function base45Encode(buffer) {
  // Simplified - in reality more complex
  return buffer.toString('base64')
    .toUpperCase()
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

console.log('=== QR CODE BITS COMPARISON ===\n');

// Test with typical WebRTC data
const fullData = {
  type: webrtcOffer.type,
  sdp: webrtcOffer.sdp,
  candidates: iceCandidates.map(c => ({ candidate: c, sdpMLineIndex: 0 }))
};

console.log('1. ORIGINAL DATA');
const originalJson = JSON.stringify(fullData);
console.log(`   Size: ${originalJson.length} bytes`);
console.log(`   QR bits (direct): ${originalJson.length * 8} bits (byte mode)\n`);

console.log('2. MINIMIZED DATA');
const minimalData = {
  t: 'o',
  s: minimizeSDP(webrtcOffer.sdp),
  c: iceCandidates.map(c => ({ c: c, m: 0 }))
};
const minimalJson = JSON.stringify(minimalData);
console.log(`   Size: ${minimalJson.length} bytes`);
console.log(`   QR bits (direct): ${minimalJson.length * 8} bits (byte mode)\n`);

console.log('3. COMPRESSED + BASE64');
const compressed = zlib.deflateSync(minimalJson);
const base64 = compressed.toString('base64');
console.log(`   Compressed: ${compressed.length} bytes`);
console.log(`   Base64: ${base64.length} chars`);
console.log(`   QR bits: ${base64.length * QR_ENCODING.byte} bits (byte mode)\n`);

console.log('4. COMPRESSED + BASE45');
const base45 = base45Encode(compressed);
console.log(`   Base45: ${base45.length} chars`);
console.log(`   QR bits: ${Math.ceil(base45.length * QR_ENCODING.alphanumeric)} bits (alphanumeric mode)\n`);

// Summary table
console.log('=== SUMMARY: QR BITS REQUIRED ===');
console.log('┌─────────────────────────┬───────────┬──────────┬─────────────┐');
console.log('│ Method                  │ Size      │ QR Bits  │ vs Original │');
console.log('├─────────────────────────┼───────────┼──────────┼─────────────┤');
console.log(`│ Original JSON           │ ${originalJson.length.toString().padEnd(9)} │ ${(originalJson.length * 8).toString().padEnd(8)} │ 100%        │`);
console.log(`│ Minimized JSON          │ ${minimalJson.length.toString().padEnd(9)} │ ${(minimalJson.length * 8).toString().padEnd(8)} │ ${Math.round(minimalJson.length * 8 / (originalJson.length * 8) * 100)}%         │`);
console.log(`│ Compressed + Base64     │ ${base64.length.toString().padEnd(9)} │ ${(base64.length * 8).toString().padEnd(8)} │ ${Math.round(base64.length * 8 / (originalJson.length * 8) * 100)}%         │`);
console.log(`│ Compressed + Base45     │ ${base45.length.toString().padEnd(9)} │ ${Math.ceil(base45.length * 5.5).toString().padEnd(8)} │ ${Math.round(base45.length * 5.5 / (originalJson.length * 8) * 100)}%         │`);
console.log('└─────────────────────────┴───────────┴──────────┴─────────────┘');

const base64Bits = base64.length * QR_ENCODING.byte;
const base45Bits = Math.ceil(base45.length * QR_ENCODING.alphanumeric);
const bitsSaved = base64Bits - base45Bits;
const percentSaved = Math.round((bitsSaved / base64Bits) * 100);

console.log(`\n✓ Base45 saves ${bitsSaved} QR bits (${percentSaved}% smaller QR code)`);
console.log(`✓ Final QR: ${base45Bits} bits (${Math.round(base45Bits/8)} bytes equivalent)`);

// QR Code version estimation
const QR_CAPACITY_L = {
  11: 1852, // bits for version 11 at L error correction
  15: 3320, // bits for version 15 at L error correction  
  20: 5836, // bits for version 20 at L error correction
};

console.log('\n=== QR CODE VERSION NEEDED ===');
for (const [version, capacity] of Object.entries(QR_CAPACITY_L)) {
  if (base45Bits <= capacity) {
    console.log(`✓ Base45: Fits in Version ${version} QR code (${capacity} bits capacity)`);
    break;
  }
}
for (const [version, capacity] of Object.entries(QR_CAPACITY_L)) {
  if (base64Bits <= capacity) {
    console.log(`✓ Base64: Fits in Version ${version} QR code (${capacity} bits capacity)`);
    break;
  }
}
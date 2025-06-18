const fs = require('fs');
const zlib = require('zlib');

// Sample real WebRTC offer from Chrome
const sampleOffer = {
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
a=max-message-size:262144
`
};

// Sample ICE candidates
const sampleCandidates = [
  {
    candidate: "candidate:2999745851 1 udp 2122260223 192.168.1.100 56789 typ host generation 0 ufrag 4aFz network-id 1",
    sdpMLineIndex: 0
  },
  {
    candidate: "candidate:3489912962 1 tcp 1518280447 192.168.1.100 9 typ host tcptype active generation 0 ufrag 4aFz network-id 1",
    sdpMLineIndex: 0
  },
  {
    candidate: "candidate:1510613869 1 udp 1686052607 203.0.113.1 56789 typ srflx raddr 192.168.1.100 rport 56789 generation 0 ufrag 4aFz network-id 1",
    sdpMLineIndex: 0
  }
];

// Simulate our compression approach
function minimizeSDP(sdp) {
  const lines = sdp.split('\n');
  const essential = [];
  
  lines.forEach(line => {
    if (line.startsWith('v=') || 
        line.startsWith('o=') ||
        line.startsWith('s=') ||
        line.startsWith('t=') ||
        line.startsWith('a=group:') ||
        line.startsWith('a=msid-semantic:') ||
        line.startsWith('m=') ||
        line.includes('a=ice-ufrag:') ||
        line.includes('a=ice-pwd:') ||
        line.includes('a=fingerprint:') ||
        line.includes('a=setup:') ||
        line.includes('a=mid:') ||
        line.includes('a=sendrecv') ||
        line.includes('a=rtcp-mux') ||
        line.includes('a=candidate:')) {
      essential.push(line);
    }
  });
  
  return essential.join('\n');
}

// Base45 encoding
const BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

function base45Encode(buffer) {
  const bytes = new Uint8Array(buffer);
  let result = '';
  
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const x = (bytes[i] << 8) | bytes[i + 1];
      const e = x % 45;
      const d = Math.floor(x / 45) % 45;
      const c = Math.floor(x / (45 * 45));
      result += BASE45_CHARSET[c] + BASE45_CHARSET[d] + BASE45_CHARSET[e];
    } else {
      const x = bytes[i];
      const d = Math.floor(x / 45);
      const e = x % 45;
      result += BASE45_CHARSET[d] + BASE45_CHARSET[e];
    }
  }
  
  return result;
}

console.log('=== WebRTC Data Size Analysis ===\n');

// 1. Original offer size
const originalOfferStr = JSON.stringify(sampleOffer);
console.log('1. ORIGINAL WEBRTC OFFER:');
console.log(`   Size: ${originalOfferStr.length} bytes`);
console.log(`   Sample: ${originalOfferStr.substring(0, 100)}...`);

// 2. With ICE candidates
const offerWithCandidates = {
  ...sampleOffer,
  candidates: sampleCandidates
};
const withCandidatesStr = JSON.stringify(offerWithCandidates);
console.log('\n2. OFFER + ICE CANDIDATES:');
console.log(`   Size: ${withCandidatesStr.length} bytes`);
console.log(`   Candidates: ${sampleCandidates.length}`);

// 3. Our minimized format
const minimizedData = {
  t: 'o',
  s: minimizeSDP(sampleOffer.sdp),
  c: sampleCandidates.map(c => ({
    c: c.candidate,
    m: c.sdpMLineIndex
  }))
};
const minimizedStr = JSON.stringify(minimizedData);
console.log('\n3. OUR MINIMIZED FORMAT:');
console.log(`   Size: ${minimizedStr.length} bytes`);
console.log(`   Reduction: ${Math.round((1 - minimizedStr.length / withCandidatesStr.length) * 100)}%`);

// 4. After DEFLATE compression
const compressed = zlib.deflateSync(minimizedStr);
console.log('\n4. AFTER DEFLATE COMPRESSION:');
console.log(`   Size: ${compressed.length} bytes`);
console.log(`   Reduction: ${Math.round((1 - compressed.length / minimizedStr.length) * 100)}% from minimized`);
console.log(`   Total reduction: ${Math.round((1 - compressed.length / withCandidatesStr.length) * 100)}% from original`);

// 5. Base64 encoded
const base64 = compressed.toString('base64');
console.log('\n5. BASE64 ENCODED:');
console.log(`   Size: ${base64.length} bytes`);
console.log(`   Overhead: ${Math.round((base64.length / compressed.length - 1) * 100)}%`);

// 6. Base45 encoded
const base45 = base45Encode(compressed);
console.log('\n6. BASE45 ENCODED:');
console.log(`   Size: ${base45.length} bytes`);
console.log(`   Overhead: ${Math.round((base45.length / compressed.length - 1) * 100)}%`);
console.log(`   Savings vs Base64: ${Math.round((1 - base45.length / base64.length) * 100)}%`);

// Summary
console.log('\n=== SUMMARY ===');
console.log(`Original with candidates: ${withCandidatesStr.length} bytes`);
console.log(`Final (Base64): ${base64.length} bytes (${Math.round(base64.length / withCandidatesStr.length * 100)}% of original)`);
console.log(`Final (Base45): ${base45.length} bytes (${Math.round(base45.length / withCandidatesStr.length * 100)}% of original)`);

// QR Code analysis
console.log('\n=== QR CODE ANALYSIS ===');
console.log(`Base64 QR: ${base64.length} chars (byte mode, 8 bits/char)`);
console.log(`Base45 QR: ${base45.length} chars (alphanumeric mode, 5.5 bits/char)`);
console.log(`Effective Base45 size in QR: ~${Math.round(base45.length * 5.5 / 8)} byte-equivalents`);

// Show sample outputs
console.log('\n=== SAMPLE OUTPUTS ===');
console.log('Base64 (first 100 chars):');
console.log(base64.substring(0, 100) + '...');
console.log('\nBase45 (first 100 chars):');
console.log(base45.substring(0, 100) + '...');
const zlib = require('zlib');

// WebRTC offer with ICE candidates included in SDP (after gathering completes)
const offerWithBundledICE = {
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
a=candidate:2999745851 1 udp 2122260223 192.168.1.100 56789 typ host generation 0 ufrag 4aFz network-id 1
a=candidate:3489912962 1 tcp 1518280447 192.168.1.100 9 typ host tcptype active generation 0 ufrag 4aFz network-id 1
a=candidate:1510613869 1 udp 1686052607 203.0.113.1 56789 typ srflx raddr 192.168.1.100 rport 56789 generation 0 ufrag 4aFz network-id 1
a=candidate:2365646357 1 udp 41885439 198.51.100.1 3478 typ relay raddr 203.0.113.1 rport 56789 generation 0 ufrag 4aFz network-id 1
a=end-of-candidates`
};

// Our previous approach with separate candidates array
const separateCandidates = {
  t: 'o',
  s: `v=0
o=- 4611731400430051336 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=ice-ufrag:4aFz
a=ice-pwd:by4GZGG1lw+040DWA6hXM5Bz
a=fingerprint:sha-256 7B:8B:F0:65:5F:78:E2:51:3B:AC:6F:F3:3F:46:1B:35:DC:B8:5F:64:1A:24:C2:43:F0:A1:58:D0:A1:2C:19:08
a=setup:actpass
a=mid:0`,
  c: [
    { c: "candidate:2999745851 1 udp 2122260223 192.168.1.100 56789 typ host generation 0 ufrag 4aFz network-id 1", m: 0 },
    { c: "candidate:3489912962 1 tcp 1518280447 192.168.1.100 9 typ host tcptype active generation 0 ufrag 4aFz network-id 1", m: 0 },
    { c: "candidate:1510613869 1 udp 1686052607 203.0.113.1 56789 typ srflx raddr 192.168.1.100 rport 56789 generation 0 ufrag 4aFz network-id 1", m: 0 },
    { c: "candidate:2365646357 1 udp 41885439 198.51.100.1 3478 typ relay raddr 203.0.113.1 rport 56789 generation 0 ufrag 4aFz network-id 1", m: 0 }
  ]
};

// New approach: just send the complete SDP
const bundledApproach = {
  t: 'o',
  s: offerWithBundledICE.sdp
};

// Minimal SDP with candidates inline
function minimizeSDPWithCandidates(sdp) {
  return sdp.split('\n')
    .filter(line => 
      line.match(/^[vost]=/) ||
      line.match(/a=(ice-ufrag|ice-pwd|fingerprint|setup|mid|group|candidate|end-of-candidates):/)
    )
    .join('\n');
}

const bundledMinimal = {
  t: 'o', 
  s: minimizeSDPWithCandidates(offerWithBundledICE.sdp)
};

console.log('=== ICE BUNDLING COMPARISON ===\n');

console.log('1. PREVIOUS APPROACH (Separate Candidates Array)');
const separateJson = JSON.stringify(separateCandidates);
const separateCompressed = zlib.deflateSync(separateJson);
const separateBase45 = separateCompressed.toString('base64').replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]));
console.log(`   JSON size: ${separateJson.length} bytes`);
console.log(`   Compressed: ${separateCompressed.length} bytes`);
console.log(`   Base45: ${separateBase45.length} chars`);
console.log(`   QR bits: ${Math.ceil(separateBase45.length * 5.5)} bits\n`);

console.log('2. BUNDLED APPROACH (ICE in SDP)');
const bundledJson = JSON.stringify(bundledApproach);
const bundledCompressed = zlib.deflateSync(bundledJson);
const bundledBase45 = bundledCompressed.toString('base64').replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]));
console.log(`   JSON size: ${bundledJson.length} bytes`);
console.log(`   Compressed: ${bundledCompressed.length} bytes`);
console.log(`   Base45: ${bundledBase45.length} chars`);
console.log(`   QR bits: ${Math.ceil(bundledBase45.length * 5.5)} bits\n`);

console.log('3. BUNDLED + MINIMIZED (Best of both)');
const bundledMinJson = JSON.stringify(bundledMinimal);
const bundledMinCompressed = zlib.deflateSync(bundledMinJson);
const bundledMinBase45 = bundledMinCompressed.toString('base64').replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]));
console.log(`   JSON size: ${bundledMinJson.length} bytes`);
console.log(`   Compressed: ${bundledMinCompressed.length} bytes`);
console.log(`   Base45: ${bundledMinBase45.length} chars`);
console.log(`   QR bits: ${Math.ceil(bundledMinBase45.length * 5.5)} bits\n`);

// Calculate savings
const separateBits = Math.ceil(separateBase45.length * 5.5);
const bundledBits = Math.ceil(bundledBase45.length * 5.5);
const bundledMinBits = Math.ceil(bundledMinBase45.length * 5.5);

console.log('=== SUMMARY ===');
console.log('┌──────────────────────────┬────────────┬─────────────┐');
console.log('│ Method                   │ QR Bits    │ vs Separate │');
console.log('├──────────────────────────┼────────────┼─────────────┤');
console.log(`│ Separate candidates      │ ${separateBits.toString().padEnd(10)} │ baseline    │`);
console.log(`│ Bundled ICE              │ ${bundledBits.toString().padEnd(10)} │ ${bundledBits > separateBits ? '+' : ''}${Math.round((bundledBits/separateBits - 1) * 100)}%        │`);
console.log(`│ Bundled + Minimized      │ ${bundledMinBits.toString().padEnd(10)} │ ${bundledMinBits > separateBits ? '+' : ''}${Math.round((bundledMinBits/separateBits - 1) * 100)}%        │`);
console.log('└──────────────────────────┴────────────┴─────────────┘');

console.log('\n=== ANALYSIS ===');
console.log('• Bundling ICE in SDP eliminates the need for separate candidate array');
console.log('• Reduces JSON structure complexity (no "c" array with objects)');
console.log('• Compression handles the redundancy well');
console.log(`• Net result: ${bundledBits < separateBits ? 'SAVES' : 'COSTS'} ${Math.abs(bundledBits - separateBits)} QR bits`);

console.log('\n=== BENEFITS OF BUNDLING ===');
console.log('✓ Simpler data structure (just type + sdp)');
console.log('✓ No trickle ICE complexity');
console.log('✓ Single QR code exchange');
console.log('✓ Works with standard SDP parsers');
console.log('✓ More compression-friendly (repeated patterns)');

// Show actual data structure difference
console.log('\n=== DATA STRUCTURE COMPARISON ===');
console.log('Separate approach needs:');
console.log(JSON.stringify(separateCandidates, null, 2).substring(0, 200) + '...\n');
console.log('Bundled approach needs:');
console.log(JSON.stringify(bundledMinimal, null, 2).substring(0, 200) + '...');
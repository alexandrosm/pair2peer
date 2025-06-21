#!/usr/bin/env node

// Full Node.js test of the compression/decompression pipeline
import { compactSDP, expandSDP } from './sdp-compact.js';
import { encodeWebRTCData, decodeWebRTCData } from './asn1-uper-codec.js';

// Create a realistic test SDP (from browser logs)
const originalSDP = `v=0
o=- 1878430408 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=extmap-allow-mixed
a=msid-semantic: WMS
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:test
a=ice-pwd:testpassword123456789012
a=ice-options:trickle
a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF
a=setup:actpass
a=mid:0
a=sctp-port:5000
a=candidate:1878430408 1 udp 2122260223 169.254.199.180 63362 typ host generation 0 network-id 1
a=candidate:1136774609 1 udp 2122194687 172.27.80.1 63363 typ host generation 0 network-id 2
a=candidate:3398530953 1 udp 2122129151 172.27.192.1 63364 typ host generation 0 network-id 3
a=candidate:1925704420 1 udp 2122063615 192.168.1.7 63365 typ host generation 0 network-id 4 network-cost 10
a=candidate:1472079118 1 udp 1685855999 24.17.60.171 63365 typ srflx raddr 192.168.1.7 rport 63365 generation 0 network-id 4 network-cost 10`;

console.log('=== Node.js Full Pipeline Test ===\n');

console.log('1. Original SDP:');
console.log(originalSDP);
console.log('\nOriginal size:', originalSDP.length, 'chars');

// Step 2: Compact the SDP
console.log('\n2. Compacting SDP...');
const compacted = compactSDP(originalSDP);
compacted.t = 'o'; // Add type field
console.log('Compacted:', JSON.stringify(compacted, null, 2));

// Step 3: Encode with ASN.1 UPER
console.log('\n3. Encoding with ASN.1 UPER...');
const encoded = encodeWebRTCData(compacted);
console.log('Encoded bytes:', encoded.length);
console.log('Hex:', Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Step 4: Convert to Base64 for QR
const binaryStr = String.fromCharCode.apply(null, encoded);
const base64 = btoa(binaryStr);
console.log('\n4. Base64 for QR:', base64);
console.log('QR size:', base64.length, 'chars');

// Step 5: Decode from Base64
console.log('\n5. Decoding from Base64...');
const decodedBinary = atob(base64);
const decodedBytes = new Uint8Array(decodedBinary.length);
for (let i = 0; i < decodedBinary.length; i++) {
    decodedBytes[i] = decodedBinary.charCodeAt(i);
}

// Step 6: Decode ASN.1 UPER
console.log('\n6. Decoding ASN.1 UPER...');
const decoded = decodeWebRTCData(decodedBytes);
console.log('Decoded:', JSON.stringify(decoded, null, 2));

// Step 7: Expand back to SDP
console.log('\n7. Expanding back to SDP...');
const expandedSDP = expandSDP(decoded, 'offer');
console.log('Expanded SDP:');
console.log(expandedSDP);

// Step 8: Validate the result
console.log('\n8. Validation:');
const originalLines = originalSDP.split('\n').map(l => l.trim()).filter(l => l);
const expandedLines = expandedSDP.split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l);

// Check key fields
const checks = {
    'ice-ufrag': originalLines.find(l => l.includes('a=ice-ufrag:')),
    'ice-pwd': originalLines.find(l => l.includes('a=ice-pwd:')),
    'fingerprint': originalLines.find(l => l.includes('a=fingerprint:')),
    'candidates': originalLines.filter(l => l.includes('a=candidate:')).length
};

console.log('Original ice-ufrag:', checks['ice-ufrag']);
console.log('Expanded ice-ufrag:', expandedLines.find(l => l.includes('a=ice-ufrag:')));
console.log('\nOriginal candidates:', checks.candidates);
console.log('Expanded candidates:', expandedLines.filter(l => l.includes('a=candidate:')).length);

// Step 9: Test SDP parsing (mock)
console.log('\n9. Testing SDP format...');
try {
    // Basic validation
    const candidateLines = expandedLines.filter(l => l.startsWith('a=candidate:'));
    for (const line of candidateLines) {
        const parts = line.split(' ');
        console.log(`Checking: ${line.substring(0, 60)}...`);
        
        // Basic checks
        if (parts.length < 8) throw new Error('Too few parts in candidate');
        if (parts[6] !== 'typ') throw new Error('Missing typ keyword');
        
        const port = parseInt(parts[5]);
        if (port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`);
    }
    console.log('✅ All candidate lines look valid');
} catch (error) {
    console.log('❌ Validation error:', error.message);
}

// Step 10: Compression stats
console.log('\n10. Compression Statistics:');
console.log('Original SDP:', originalSDP.length, 'chars');
console.log('Compressed (Base64):', base64.length, 'chars');
console.log('Compression ratio:', ((1 - base64.length / originalSDP.length) * 100).toFixed(1) + '%');
console.log('Binary size:', encoded.length, 'bytes');
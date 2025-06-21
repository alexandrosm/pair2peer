#!/usr/bin/env node

// Test with minimal SDP - remove all optional attributes
import { expandSDP } from './sdp-compact.js';

// Backup the original expandSDP
const originalExpandSDP = expandSDP.toString();

// Create a minimal version for testing
function minimalExpandSDP(compact, type = 'offer') {
    if (!compact.u || !compact.p || !compact.f) {
        throw new Error('Missing required SDP fields');
    }
    
    const sessionId = Date.now();
    const lines = [
        'v=0',
        `o=- ${sessionId} 2 IN IP4 127.0.0.1`,
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'a=extmap-allow-mixed',
        'a=msid-semantic: WMS',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        'c=IN IP4 0.0.0.0',
        `a=ice-ufrag:${compact.u}`,
        `a=ice-pwd:${compact.p}`,
        'a=ice-options:trickle',
        `a=fingerprint:sha-256 ${compact.f}`,
        `a=setup:${compact.s === 'a' ? 'actpass' : compact.s === 'p' ? 'passive' : 'active'}`,
        'a=mid:0',
        'a=sctp-port:5000'
    ];
    
    // Add minimal candidates
    if (compact.c && Array.isArray(compact.c)) {
        compact.c.forEach((cand, index) => {
            const parts = cand.split(',');
            const type = parts[0];
            
            if (type === 'h') {
                const [ip, port] = parts[1].split(':');
                // Minimal host candidate
                lines.push(`a=candidate:${index + 1} 1 udp 2122260223 ${ip} ${port} typ host generation 0`);
            } else if (type === 's') {
                const [ip, port] = parts[1].split(':');
                const [raddr, rport] = parts[2].split(':');
                // Minimal srflx candidate
                lines.push(`a=candidate:${index + 1} 1 udp 1686052607 ${ip} ${port} typ srflx raddr ${raddr} rport ${rport} generation 0`);
            }
        });
    }
    
    return lines.join('\r\n');
}

const testData = {
  "t": "o",
  "u": "test",
  "p": "testpassword123456789012",
  "f": "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
  "s": "a",
  "c": [
    "h,192.168.1.7:50000,4",
    "s,24.17.60.171:50000,192.168.1.7:50000,4"
  ]
};

console.log('=== Testing Minimal SDP ===\n');

console.log('1. Current expandSDP output:');
const currentSDP = expandSDP(testData);
console.log(currentSDP);

console.log('\n2. Minimal expandSDP output:');
const minimalSDP = minimalExpandSDP(testData);
console.log(minimalSDP);

console.log('\n3. Differences:');
const currentLines = currentSDP.split(/\r\n|\r|\n/);
const minimalLines = minimalSDP.split(/\r\n|\r|\n/);

currentLines.forEach((line, idx) => {
    if (line.includes('candidate') && minimalLines[idx] && line !== minimalLines[idx]) {
        console.log(`Current: ${line}`);
        console.log(`Minimal: ${minimalLines[idx]}`);
        console.log('');
    }
});
#!/usr/bin/env node

// Debug the exact SDP that's failing
import { expandSDP } from './sdp-compact.js';

const failingData = {
  "t": "o",
  "u": "StWD",
  "p": "cmAa2n4/h+mt2ze+54N+nPG/",
  "f": "B0:B6:B6:6D:A3:CF:6F:13:46:D4:BD:76:D0:57:F1:CB:1A:0A:3A:E7:6E:03:0E:33:49:4B:8E:24:42:CD:2B:8B",
  "s": "a",
  "c": [
    "h,169.254.199.180:63362,1",
    "h,172.27.80.1:63363,2",
    "h,172.27.192.1:63364,3",
    "h,192.168.1.7:63365,4",
    "s,24.17.60.171:63365,192.168.1.7:63365,4"
  ]
};

console.log('Expanding SDP with exact failing data...\n');
const sdp = expandSDP(failingData, 'offer');

console.log('Generated SDP:');
console.log(sdp);

// Check each line
console.log('\n=== Line by line analysis ===');
const lines = sdp.split(/\r\n|\r|\n/);
lines.forEach((line, idx) => {
    if (line.includes('srflx')) {
        console.log(`\nLine ${idx}: "${line}"`);
        console.log('Length:', line.length);
        console.log('Ends with space?', line.endsWith(' '));
        console.log('Contains tab?', line.includes('\t'));
        
        // Check for non-ASCII characters
        const nonAscii = [];
        for (let i = 0; i < line.length; i++) {
            const code = line.charCodeAt(i);
            if (code > 127) {
                nonAscii.push({ pos: i, char: line[i], code });
            }
        }
        if (nonAscii.length > 0) {
            console.log('Non-ASCII characters:', nonAscii);
        }
    }
});

// Compare with browser candidate
const browserCandidate = "a=candidate:1679752656 1 udp 1685855999 24.17.60.171 62688 typ srflx raddr 192.168.1.7 rport 62688 generation 0 network-id 4 network-cost 10";
const ourCandidate = lines.find(l => l.includes('srflx'));

console.log('\n=== Comparing with browser candidate ===');
console.log('Browser:', browserCandidate);
console.log('Ours:   ', ourCandidate);

// Character by character comparison
if (ourCandidate) {
    const minLen = Math.min(browserCandidate.length, ourCandidate.length);
    let firstDiff = -1;
    for (let i = 0; i < minLen; i++) {
        if (browserCandidate[i] !== ourCandidate[i]) {
            firstDiff = i;
            break;
        }
    }
    
    if (firstDiff >= 0) {
        console.log(`\nFirst difference at position ${firstDiff}:`);
        console.log(`Browser: "${browserCandidate.substring(firstDiff, firstDiff + 20)}..."`);
        console.log(`Ours:    "${ourCandidate.substring(firstDiff, firstDiff + 20)}..."`);
    }
}
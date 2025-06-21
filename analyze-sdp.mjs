#!/usr/bin/env node

// Analyze the exact SDP format that's failing
const failingSDP = `v=0
o=- 1750494244051 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=extmap-allow-mixed
a=msid-semantic: WMS
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:StWD
a=ice-pwd:cmAa2n4/h+mt2ze+54N+nPG/
a=ice-options:trickle
a=fingerprint:sha-256 B0:B6:B6:6D:A3:CF:6F:13:46:D4:BD:76:D0:57:F1:CB:1A:0A:3A:E7:6E:03:0E:33:49:4B:8E:24:42:CD:2B:8B
a=setup:actpass
a=mid:0
a=sctp-port:5000
a=candidate:100000000 1 udp 2122260223 169.254.199.180 63362 typ host generation 0 network-id 1 network-cost 10
a=candidate:100000001 1 udp 2122260223 172.27.80.1 63363 typ host generation 0 network-id 2 network-cost 10
a=candidate:100000002 1 udp 2122260223 172.27.192.1 63364 typ host generation 0 network-id 3 network-cost 10
a=candidate:100000003 1 udp 2122260223 192.168.1.7 63365 typ host generation 0 network-id 4 network-cost 10
a=candidate:200000004 1 udp 1686052607 24.17.60.171 63365 typ srflx raddr 192.168.1.7 rport 63365 generation 0 network-id 4 network-cost 10`;

// Original browser-generated candidate that works
const browserCandidate = "a=candidate:1679752656 1 udp 1685855999 24.17.60.171 62688 typ srflx raddr 192.168.1.7 rport 62688 generation 0 network-id 4 network-cost 10";

// Our generated candidate that fails
const ourCandidate = "a=candidate:200000004 1 udp 1686052607 24.17.60.171 63365 typ srflx raddr 192.168.1.7 rport 63365 generation 0 network-id 4 network-cost 10";

console.log('Analyzing SDP differences...\n');

console.log('Browser-generated srflx candidate:');
console.log(browserCandidate);
console.log('\nOur generated srflx candidate:');
console.log(ourCandidate);

// Parse both candidates
function parseCandidate(line) {
    const parts = line.split(' ');
    return {
        foundation: parts[0].split(':')[1],
        componentId: parts[1],
        transport: parts[2],
        priority: parts[3],
        ip: parts[4],
        port: parts[5],
        typField: parts[6],
        type: parts[7],
        raddr: parts[9],
        rport: parts[11],
        generation: parts[13],
        networkId: parts[15],
        networkCost: parts[17]
    };
}

const browser = parseCandidate(browserCandidate);
const ours = parseCandidate(ourCandidate);

console.log('\n=== Differences ===');
for (const key in browser) {
    if (browser[key] !== ours[key]) {
        console.log(`${key}: Browser="${browser[key]}" vs Ours="${ours[key]}"`);
    }
}

// Check for any pattern issues
console.log('\n=== Checking patterns ===');

// Check if foundation is too simple
if (ours.foundation.match(/^[12]0+\d+$/)) {
    console.log('⚠️  Foundation looks artificial (too many zeros)');
}

// Check priority
console.log(`Priority difference: ${Math.abs(parseInt(browser.priority) - parseInt(ours.priority))}`);

// Let's also check what a minimal working SDP might look like
console.log('\n=== Testing minimal SDP variants ===');

// Remove different attributes to see what's essential
const attributes = [
    'network-cost 10',
    'network-id 4',
    'generation 0'
];

console.log('\nTrying to identify the problematic attribute by removal:');
attributes.forEach(attr => {
    const testLine = ourCandidate.replace(` ${attr}`, '');
    console.log(`Without "${attr}": ${testLine.length < ourCandidate.length ? '✓ removed' : '✗ not found'}`);
});

// Check line ending issues
console.log('\n=== Line ending analysis ===');
const lines = failingSDP.split(/\r\n|\r|\n/);
console.log(`Total lines: ${lines.length}`);
console.log(`Last line: "${lines[lines.length - 1]}"`);
console.log(`Last line length: ${lines[lines.length - 1].length}`);

// Check for hidden characters
const lastLine = lines[lines.length - 1];
console.log('Last line char codes:', Array.from(lastLine).map(c => c.charCodeAt(0)));

// Check if the issue might be with multiple attributes
console.log('\n=== Checking attribute combinations ===');
const srflxLine = lines.find(l => l.includes('typ srflx'));
if (srflxLine) {
    const attrs = srflxLine.match(/(network-id \d+|network-cost \d+|generation \d+)/g);
    console.log('srflx attributes found:', attrs);
}
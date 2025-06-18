const zlib = require('zlib');

// Full WebRTC SDP after ICE gathering
const fullSDP = `v=0
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
a=candidate:1510613869 1 udp 1686052607 203.0.113.1 56789 typ srflx raddr 192.168.1.100 rport 56789 generation 0 ufrag 4aFz network-id 1
a=candidate:2365646357 1 udp 41885439 198.51.100.1 3478 typ relay raddr 203.0.113.1 rport 56789 generation 0 ufrag 4aFz network-id 1
a=end-of-candidates`;

// Current minimization approach
function currentMinimize(sdp) {
    return sdp.split('\n')
        .filter(line => 
            line.match(/^[vost]=/) ||
            line.match(/a=(ice-ufrag|ice-pwd|fingerprint|setup|mid|group|candidate|end-of-candidates):/)
        )
        .join('\n');
}

// Aggressive SDP compaction
function aggressiveCompact(sdp) {
    const lines = sdp.split('\n');
    const result = [];
    
    lines.forEach(line => {
        // Keep version (required)
        if (line.startsWith('v=')) {
            result.push('v=0');
        }
        // Minimal origin (required but can be shortened)
        else if (line.startsWith('o=')) {
            result.push('o=- 1 1 IN IP4 0.0.0.0');
        }
        // Skip session name and timing (use defaults)
        else if (line.startsWith('s=') || line.startsWith('t=')) {
            // Skip - peers can assume defaults
        }
        // Keep ICE credentials (essential)
        else if (line.includes('a=ice-ufrag:')) {
            const ufrag = line.split('a=ice-ufrag:')[1];
            result.push(`U:${ufrag}`); // Shorten to U:
        }
        else if (line.includes('a=ice-pwd:')) {
            const pwd = line.split('a=ice-pwd:')[1];
            result.push(`P:${pwd}`); // Shorten to P:
        }
        // Shorten fingerprint
        else if (line.includes('a=fingerprint:')) {
            const fp = line.split(' ')[1];
            result.push(`F:${fp}`); // Just the hex, assume SHA-256
        }
        // Keep setup (but shorten)
        else if (line.includes('a=setup:')) {
            const setup = line.split(':')[1];
            result.push(`S:${setup[0]}`); // Just first letter: a/p/c
        }
        // Compact candidates
        else if (line.includes('a=candidate:')) {
            // Extract only essential parts
            const parts = line.split(' ');
            const ip = parts[4];
            const port = parts[5];
            const typ = parts[7];
            
            // Ultra-compact format: type,ip:port
            if (typ === 'host') {
                result.push(`C:h,${ip}:${port}`);
            } else if (typ === 'srflx') {
                const raddr = parts[9];
                const rport = parts[11];
                result.push(`C:s,${ip}:${port},${raddr}:${rport}`);
            } else if (typ === 'relay') {
                result.push(`C:r,${ip}:${port}`);
            }
        }
        // Skip everything else (bundle, mid, options, etc. - use defaults)
    });
    
    return result.join('\n');
}

// Ultra-compact JSON format
function ultraCompactFormat(sdp) {
    const compact = aggressiveCompact(sdp);
    const lines = compact.split('\n');
    
    // Extract components
    let u, p, f, s;
    const c = [];
    
    lines.forEach(line => {
        if (line.startsWith('U:')) u = line.substring(2);
        else if (line.startsWith('P:')) p = line.substring(2);
        else if (line.startsWith('F:')) f = line.substring(2);
        else if (line.startsWith('S:')) s = line.substring(2);
        else if (line.startsWith('C:')) c.push(line.substring(2));
    });
    
    // Return ultra-minimal object
    return { u, p, f, s, c };
}

console.log('=== SDP COMPACTION ANALYSIS ===\n');

// Test different approaches
const approaches = [
    {
        name: "Full SDP",
        data: { t: 'o', s: fullSDP }
    },
    {
        name: "Current Minimize",
        data: { t: 'o', s: currentMinimize(fullSDP) }
    },
    {
        name: "Aggressive Compact", 
        data: { t: 'o', s: aggressiveCompact(fullSDP) }
    },
    {
        name: "Ultra Format",
        data: { t: 'o', ...ultraCompactFormat(fullSDP) }
    }
];

const results = [];

approaches.forEach(approach => {
    const json = JSON.stringify(approach.data);
    const compressed = zlib.deflateSync(json);
    const base45 = compressed.toString('base64').replace(/[+/=]/g, '');
    const qrBits = Math.ceil(base45.length * 5.5);
    
    results.push({
        name: approach.name,
        json: json.length,
        compressed: compressed.length,
        base45: base45.length,
        qrBits: qrBits
    });
    
    console.log(`${approach.name}:`);
    console.log(`  JSON: ${json.length} bytes`);
    console.log(`  Compressed: ${compressed.length} bytes`);
    console.log(`  Base45: ${base45.length} chars`);
    console.log(`  QR bits: ${qrBits}`);
    console.log(`  Sample: ${json.substring(0, 80)}...\n`);
});

// Comparison table
console.log('=== COMPARISON TABLE ===');
console.log('┌──────────────────────┬──────────┬────────────┬──────────┬────────────┐');
console.log('│ Method               │ JSON     │ Compressed │ Base45   │ QR Bits    │');
console.log('├──────────────────────┼──────────┼────────────┼──────────┼────────────┤');
results.forEach(r => {
    console.log(`│ ${r.name.padEnd(20)} │ ${r.json.toString().padEnd(8)} │ ${r.compressed.toString().padEnd(10)} │ ${r.base45.toString().padEnd(8)} │ ${r.qrBits.toString().padEnd(10)} │`);
});
console.log('└──────────────────────┴──────────┴────────────┴──────────┴────────────┘');

const baseline = results[0].qrBits;
const best = results[results.length - 1].qrBits;
const savings = baseline - best;

console.log(`\n✓ Ultra format saves ${savings} QR bits (${Math.round(savings/baseline*100)}% reduction)`);
console.log(`✓ Final size: ${best} bits (${Math.round(best/8)} bytes equivalent)`);

// Show the ultra-compact format
console.log('\n=== ULTRA-COMPACT FORMAT ===');
console.log('Original candidate:');
console.log('  a=candidate:2999745851 1 udp 2122260223 192.168.1.100 56789 typ host generation 0 ufrag 4aFz network-id 1');
console.log('Becomes:');
console.log('  C:h,192.168.1.100:56789');
console.log('\nFull format:');
console.log(JSON.stringify(ultraCompactFormat(fullSDP), null, 2));

// Decoding logic
console.log('\n=== DECODING LOGIC ===');
console.log('To reconstruct SDP from ultra format:');
console.log('1. u → a=ice-ufrag:${u}');
console.log('2. p → a=ice-pwd:${p}');
console.log('3. f → a=fingerprint:sha-256 ${f}');
console.log('4. s → a=setup:${s === "a" ? "actpass" : s === "p" ? "passive" : "active"}');
console.log('5. C:h,ip:port → candidate:... typ host ...');
console.log('6. Add required boilerplate (v=0, o=-, s=-, t=0 0, etc.)');
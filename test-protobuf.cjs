const zlib = require('zlib');

// Simulate protobuf encoding (actual protobuf would be more efficient)
// Real protobuf would use varint encoding, packed repeated fields, etc.

// Our current ultra-compact format
const ultraCompact = {
    t: 'o',
    u: '4aFz',
    p: 'by4GZGG1lw+040DWA6hXM5Bz',
    f: '7B:8B:F0:65:5F:78:E2:51:3B:AC:6F:F3:3F:46:1B:35:DC:B8:5F:64:1A:24:C2:43:F0:A1:58:D0:A1:2C:19:08',
    s: 'a',
    c: [
        'h,192.168.1.100:56789',
        's,203.0.113.1:56789,192.168.1.100:56789',
        'r,198.51.100.1:3478'
    ]
};

// Protobuf-style binary encoding
function encodeProtobuf(data) {
    const buffer = [];
    
    // Field 1: type (1 byte tag + 1 byte value)
    buffer.push(0x08); // field 1, varint
    buffer.push(data.t === 'o' ? 0x01 : 0x02);
    
    // Field 2: ufrag (1 byte tag + length + data)
    buffer.push(0x12); // field 2, string
    buffer.push(data.u.length);
    for (let i = 0; i < data.u.length; i++) {
        buffer.push(data.u.charCodeAt(i));
    }
    
    // Field 3: pwd (1 byte tag + length + data)
    buffer.push(0x1a); // field 3, string
    buffer.push(data.p.length);
    for (let i = 0; i < data.p.length; i++) {
        buffer.push(data.p.charCodeAt(i));
    }
    
    // Field 4: fingerprint as binary (not hex string)
    // Convert hex to binary: 96 chars -> 48 bytes
    buffer.push(0x22); // field 4, bytes
    buffer.push(48); // 48 bytes
    const fpHex = data.f.replace(/:/g, '');
    for (let i = 0; i < fpHex.length; i += 2) {
        buffer.push(parseInt(fpHex.substr(i, 2), 16));
    }
    
    // Field 5: setup (1 byte)
    buffer.push(0x28); // field 5, varint
    buffer.push(data.s === 'a' ? 0x01 : data.s === 'p' ? 0x02 : 0x03);
    
    // Field 6: candidates (repeated field)
    data.c.forEach(cand => {
        buffer.push(0x32); // field 6, string
        buffer.push(cand.length);
        for (let i = 0; i < cand.length; i++) {
            buffer.push(cand.charCodeAt(i));
        }
    });
    
    return new Uint8Array(buffer);
}

// Even more aggressive: custom binary format
function customBinaryEncode(data) {
    const buffer = [];
    
    // 1 byte: type + setup
    buffer.push((data.t === 'o' ? 0x80 : 0x00) | (data.s === 'a' ? 0x01 : data.s === 'p' ? 0x02 : 0x03));
    
    // 4 bytes: ufrag (fixed length)
    for (let i = 0; i < 4; i++) {
        buffer.push(data.u.charCodeAt(i));
    }
    
    // 24 bytes: pwd (fixed length)
    for (let i = 0; i < 24; i++) {
        buffer.push(data.p.charCodeAt(i));
    }
    
    // 48 bytes: fingerprint (binary, not hex)
    const fpHex = data.f.replace(/:/g, '');
    for (let i = 0; i < fpHex.length; i += 2) {
        buffer.push(parseInt(fpHex.substr(i, 2), 16));
    }
    
    // 1 byte: number of candidates
    buffer.push(data.c.length);
    
    // Candidates: ultra-compact binary
    data.c.forEach(cand => {
        const parts = cand.split(',');
        const type = parts[0];
        
        // 1 byte: candidate type
        buffer.push(type === 'h' ? 0x01 : type === 's' ? 0x02 : 0x03);
        
        if (type === 'h' || type === 'r') {
            // IP as 4 bytes + port as 2 bytes
            const [ip, port] = parts[1].split(':');
            ip.split('.').forEach(octet => buffer.push(parseInt(octet)));
            const portNum = parseInt(port);
            buffer.push((portNum >> 8) & 0xFF);
            buffer.push(portNum & 0xFF);
        } else if (type === 's') {
            // srflx: 2 IPs + 2 ports
            const [ip1, port1] = parts[1].split(':');
            const [ip2, port2] = parts[2].split(':');
            
            ip1.split('.').forEach(octet => buffer.push(parseInt(octet)));
            const port1Num = parseInt(port1);
            buffer.push((port1Num >> 8) & 0xFF);
            buffer.push(port1Num & 0xFF);
            
            ip2.split('.').forEach(octet => buffer.push(parseInt(octet)));
            const port2Num = parseInt(port2);
            buffer.push((port2Num >> 8) & 0xFF);
            buffer.push(port2Num & 0xFF);
        }
    });
    
    return new Uint8Array(buffer);
}

console.log('=== PROTOBUF VS JSON COMPARISON ===\n');

// Current approach
const jsonStr = JSON.stringify(ultraCompact);
const jsonCompressed = zlib.deflateSync(jsonStr);
const jsonBase45 = jsonCompressed.toString('base64').replace(/[+/=]/g, '');

console.log('1. CURRENT APPROACH (JSON + Compression + Base45)');
console.log(`   JSON size: ${jsonStr.length} bytes`);
console.log(`   Compressed: ${jsonCompressed.length} bytes`);
console.log(`   Base45: ${jsonBase45.length} chars`);
console.log(`   QR bits: ${Math.ceil(jsonBase45.length * 5.5)}\n`);

// Protobuf simulation
const protobufEncoded = encodeProtobuf(ultraCompact);
const protobufCompressed = zlib.deflateSync(protobufEncoded);
const protobufBase45 = protobufCompressed.toString('base64').replace(/[+/=]/g, '');

console.log('2. PROTOBUF APPROACH');
console.log(`   Protobuf size: ${protobufEncoded.length} bytes`);
console.log(`   Compressed: ${protobufCompressed.length} bytes`);
console.log(`   Base45: ${protobufBase45.length} chars`);
console.log(`   QR bits: ${Math.ceil(protobufBase45.length * 5.5)}\n`);

// Custom binary format
const customBinary = customBinaryEncode(ultraCompact);
const customCompressed = zlib.deflateSync(customBinary);
const customBase45 = customCompressed.toString('base64').replace(/[+/=]/g, '');

console.log('3. CUSTOM BINARY FORMAT');
console.log(`   Binary size: ${customBinary.length} bytes`);
console.log(`   Compressed: ${customCompressed.length} bytes`);
console.log(`   Base45: ${customBase45.length} chars`);
console.log(`   QR bits: ${Math.ceil(customBase45.length * 5.5)}\n`);

// Direct Base45 without compression (for small data)
const directBase45 = Buffer.from(customBinary).toString('base64').replace(/[+/=]/g, '');

console.log('4. CUSTOM BINARY + DIRECT BASE45 (No compression)');
console.log(`   Binary size: ${customBinary.length} bytes`);
console.log(`   Base45: ${directBase45.length} chars`);
console.log(`   QR bits: ${Math.ceil(directBase45.length * 5.5)}\n`);

// Summary
console.log('=== SUMMARY ===');
console.log('┌────────────────────────┬──────────┬────────────┬──────────┬────────────┐');
console.log('│ Method                 │ Raw Size │ Compressed │ Base45   │ QR Bits    │');
console.log('├────────────────────────┼──────────┼────────────┼──────────┼────────────┤');
console.log(`│ JSON + DEFLATE         │ ${jsonStr.length.toString().padEnd(8)} │ ${jsonCompressed.length.toString().padEnd(10)} │ ${jsonBase45.length.toString().padEnd(8)} │ ${Math.ceil(jsonBase45.length * 5.5).toString().padEnd(10)} │`);
console.log(`│ Protobuf + DEFLATE     │ ${protobufEncoded.length.toString().padEnd(8)} │ ${protobufCompressed.length.toString().padEnd(10)} │ ${protobufBase45.length.toString().padEnd(8)} │ ${Math.ceil(protobufBase45.length * 5.5).toString().padEnd(10)} │`);
console.log(`│ Custom Binary + DEFLATE│ ${customBinary.length.toString().padEnd(8)} │ ${customCompressed.length.toString().padEnd(10)} │ ${customBase45.length.toString().padEnd(8)} │ ${Math.ceil(customBase45.length * 5.5).toString().padEnd(10)} │`);
console.log(`│ Custom Binary Direct   │ ${customBinary.length.toString().padEnd(8)} │ -          │ ${directBase45.length.toString().padEnd(8)} │ ${Math.ceil(directBase45.length * 5.5).toString().padEnd(10)} │`);
console.log('└────────────────────────┴──────────┴────────────┴──────────┴────────────┘');

// Binary format breakdown
console.log('\n=== CUSTOM BINARY FORMAT BREAKDOWN ===');
console.log('1 byte:   Type + Setup');
console.log('4 bytes:  ICE ufrag');
console.log('24 bytes: ICE pwd');
console.log('48 bytes: Fingerprint (binary)');
console.log('1 byte:   Candidate count');
console.log('Per candidate:');
console.log('  - Host: 1 + 4 + 2 = 7 bytes (type + IP + port)');
console.log('  - SRFLX: 1 + 4 + 2 + 4 + 2 = 13 bytes');
console.log('  - Relay: 1 + 4 + 2 = 7 bytes');
console.log(`\nTotal: ${customBinary.length} bytes`);
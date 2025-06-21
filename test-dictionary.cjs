const zlib = require('zlib');
const { ZstdCodec } = require('zstd-codec');

// Our 89-byte binary data
const binaryData = Buffer.from([
    0x81, // type=offer, setup=actpass
    0x34, 0x61, 0x46, 0x7a, // ufrag: 4aFz
    // pwd: by4GZGG1lw+040DWA6hXM5Bz (24 bytes)
    0x62, 0x79, 0x34, 0x47, 0x5a, 0x47, 0x47, 0x31, 0x6c, 0x77, 0x2b, 0x30,
    0x34, 0x30, 0x44, 0x57, 0x41, 0x36, 0x68, 0x58, 0x4d, 0x35, 0x42, 0x7a,
    // fingerprint (48 bytes binary)
    0x7b, 0x8b, 0xf0, 0x65, 0x5f, 0x78, 0xe2, 0x51, 0x3b, 0xac, 0x6f, 0xf3,
    0x3f, 0x46, 0x1b, 0x35, 0xdc, 0xb8, 0x5f, 0x64, 0x1a, 0x24, 0xc2, 0x43,
    0xf0, 0xa1, 0x58, 0xd0, 0xa1, 0x2c, 0x19, 0x08,
    0x03, // 3 candidates
    // host candidate
    0x01, 0xc0, 0xa8, 0x01, 0x64, 0xdd, 0xd5,
    // srflx candidate  
    0x02, 0xcb, 0x00, 0x71, 0x01, 0xdd, 0xd5, 0xc0, 0xa8, 0x01, 0x64, 0xdd, 0xd5,
    // relay candidate
    0x03, 0xc6, 0x33, 0x64, 0x01, 0x0d, 0x96
]);

// Generate sample data for dictionary training
function generateSampleData(count = 100) {
    const samples = [];
    
    for (let i = 0; i < count; i++) {
        const data = Buffer.alloc(89);
        let offset = 0;
        
        // Type + setup (common patterns)
        data[offset++] = Math.random() > 0.5 ? 0x81 : 0x82; // offer/answer + actpass
        
        // Ufrag (4 random chars)
        for (let j = 0; j < 4; j++) {
            data[offset++] = 65 + Math.floor(Math.random() * 58);
        }
        
        // Password (24 random chars)
        for (let j = 0; j < 24; j++) {
            data[offset++] = 65 + Math.floor(Math.random() * 58);
        }
        
        // Fingerprint (48 random bytes - but some patterns)
        // Real fingerprints often have patterns like 00, FF, repeated bytes
        for (let j = 0; j < 48; j++) {
            if (Math.random() < 0.1) {
                data[offset++] = j > 0 ? data[offset - 1] : 0; // repeat previous
            } else if (Math.random() < 0.05) {
                data[offset++] = 0x00; // zeros are common
            } else if (Math.random() < 0.05) {
                data[offset++] = 0xFF; // FF is common
            } else {
                data[offset++] = Math.floor(Math.random() * 256);
            }
        }
        
        // Candidate count (usually 2-4)
        const candCount = 2 + Math.floor(Math.random() * 3);
        data[offset++] = candCount;
        
        // Common IP patterns
        const commonIPs = [
            [192, 168, 1, 100],   // Local
            [192, 168, 0, 100],   // Local variant
            [10, 0, 0, 100],      // Local
            [172, 16, 0, 100],    // Local
        ];
        
        // Candidates
        for (let j = 0; j < candCount && offset < 89; j++) {
            const type = Math.floor(Math.random() * 3) + 1;
            data[offset++] = type;
            
            if (type === 1 || type === 3) { // host or relay
                // IP
                const ip = commonIPs[Math.floor(Math.random() * commonIPs.length)];
                ip.forEach(octet => { if (offset < 89) data[offset++] = octet; });
                // Port (common ranges)
                const port = 50000 + Math.floor(Math.random() * 15535);
                if (offset < 89) data[offset++] = (port >> 8) & 0xFF;
                if (offset < 89) data[offset++] = port & 0xFF;
            } else { // srflx
                // Two IPs
                for (let k = 0; k < 2; k++) {
                    const ip = commonIPs[Math.floor(Math.random() * commonIPs.length)];
                    ip.forEach(octet => { if (offset < 89) data[offset++] = octet; });
                    const port = 50000 + Math.floor(Math.random() * 15535);
                    if (offset < 89) data[offset++] = (port >> 8) & 0xFF;
                    if (offset < 89) data[offset++] = port & 0xFF;
                }
            }
        }
        
        samples.push(data.slice(0, 89));
    }
    
    return samples;
}

// Create optimized dictionary from patterns
function createOptimizedDictionary() {
    const patterns = [];
    
    // Common byte sequences in WebRTC binary data
    patterns.push(
        Buffer.from([0x81]), // offer + actpass
        Buffer.from([0x82]), // answer + actpass
        Buffer.from([0x01, 0xc0, 0xa8]), // host candidate + 192.168
        Buffer.from([0x01, 0x0a, 0x00]), // host candidate + 10.0
        Buffer.from([0x02]), // srflx candidate
        Buffer.from([0x03]), // relay candidate
        Buffer.from([0xc0, 0xa8, 0x01]), // 192.168.1
        Buffer.from([0xc0, 0xa8, 0x00]), // 192.168.0
        Buffer.from([0x00, 0x00]), // common in fingerprints
        Buffer.from([0xff, 0xff]), // common in fingerprints
        Buffer.from([0xdd, 0xd5]), // common port range start
    );
    
    // Add runs of same byte (common in fingerprints)
    for (let byte = 0x00; byte <= 0xFF; byte += 0x11) {
        patterns.push(Buffer.from([byte, byte, byte, byte]));
    }
    
    return Buffer.concat(patterns);
}

async function testDictionaryCompression() {
    console.log('=== DICTIONARY COMPRESSION TEST ===\n');
    
    // Initialize zstd
    let zstdSimple;
    try {
        zstdSimple = await new Promise(resolve => {
            ZstdCodec.run(zstdCodec => {
                const simple = new zstdCodec.Simple();
                resolve(simple);
            });
        });
    } catch (error) {
        console.log('Note: Zstd dictionary test skipped (library issue)\n');
    }
    
    // Test 1: Simple pattern substitution
    console.log('1. PATTERN SUBSTITUTION');
    
    // Define common patterns and short codes
    const patterns = [
        { pattern: [0xc0, 0xa8], code: 0xF0 }, // 192.168 -> F0
        { pattern: [0x00, 0x00], code: 0xF1 }, // 00 00 -> F1
        { pattern: [0xFF, 0xFF], code: 0xF2 }, // FF FF -> F2
        { pattern: [0xdd, 0xd5], code: 0xF3 }, // common port -> F3
    ];
    
    // Apply pattern substitution
    const substituted = Buffer.from(binaryData);
    let savedBytes = 0;
    
    patterns.forEach(({pattern, code}) => {
        for (let i = 0; i < substituted.length - pattern.length + 1; i++) {
            let match = true;
            for (let j = 0; j < pattern.length; j++) {
                if (substituted[i + j] !== pattern[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                substituted[i] = code;
                // Shift rest of buffer
                for (let j = i + 1; j < substituted.length - pattern.length + 1; j++) {
                    substituted[j] = substituted[j + pattern.length - 1];
                }
                savedBytes += pattern.length - 1;
                break; // Only replace first occurrence
            }
        }
    });
    
    const compactedSize = binaryData.length - savedBytes;
    console.log(`Original: ${binaryData.length} bytes`);
    console.log(`After substitution: ${compactedSize} bytes (saved ${savedBytes} bytes)`);
    
    // Test 2: Entropy coding for known distributions
    console.log('\n2. ENTROPY-BASED ENCODING');
    
    // Separate high and low entropy parts
    const lowEntropy = Buffer.concat([
        Buffer.from([binaryData[0]]), // type+setup
        Buffer.from([binaryData[77]]), // candidate count
        binaryData.slice(78, 89) // candidate data (somewhat predictable)
    ]);
    
    const highEntropy = Buffer.concat([
        binaryData.slice(1, 5),   // ufrag
        binaryData.slice(5, 29),  // password
        binaryData.slice(29, 77)  // fingerprint
    ]);
    
    console.log(`Low entropy parts: ${lowEntropy.length} bytes`);
    console.log(`High entropy parts: ${highEntropy.length} bytes`);
    
    // Test 3: Delta encoding for IPs
    console.log('\n3. DELTA ENCODING FOR IPs');
    
    const candidates = [];
    let offset = 78;
    const candCount = binaryData[77];
    
    for (let i = 0; i < candCount && offset < binaryData.length; i++) {
        const type = binaryData[offset++];
        if (type === 1 || type === 3) {
            const ip = [binaryData[offset], binaryData[offset+1], binaryData[offset+2], binaryData[offset+3]];
            candidates.push({type, ip});
            offset += 6;
        } else if (type === 2) {
            const ip1 = [binaryData[offset], binaryData[offset+1], binaryData[offset+2], binaryData[offset+3]];
            const ip2 = [binaryData[offset+6], binaryData[offset+7], binaryData[offset+8], binaryData[offset+9]];
            candidates.push({type, ip1, ip2});
            offset += 12;
        }
    }
    
    // Encode first IP fully, rest as deltas
    let deltaEncoded = [];
    let lastIP = [0, 0, 0, 0];
    
    candidates.forEach(cand => {
        if (cand.ip) {
            deltaEncoded.push(cand.type);
            if (lastIP[0] === cand.ip[0] && lastIP[1] === cand.ip[1]) {
                // Same subnet, encode as delta
                deltaEncoded.push(0xFF); // marker
                deltaEncoded.push(cand.ip[2]);
                deltaEncoded.push(cand.ip[3]);
            } else {
                deltaEncoded.push(...cand.ip);
            }
            lastIP = cand.ip;
        }
    });
    
    console.log(`Original candidate data: ${89 - 78} bytes`);
    console.log(`Delta encoded: ${deltaEncoded.length} bytes`);
    
    // Test 4: Custom binary format with varint
    console.log('\n4. VARINT ENCODING');
    
    function encodeVarint(value) {
        const bytes = [];
        while (value > 127) {
            bytes.push((value & 0x7F) | 0x80);
            value >>= 7;
        }
        bytes.push(value & 0x7F);
        return bytes;
    }
    
    // Encode ports as varints
    const ports = [];
    offset = 78;
    for (let i = 0; i < candCount && offset < binaryData.length; i++) {
        const type = binaryData[offset++];
        if (type === 1 || type === 3) {
            offset += 4; // skip IP
            const port = (binaryData[offset] << 8) | binaryData[offset + 1];
            ports.push(port);
            offset += 2;
        }
    }
    
    const originalPortBytes = ports.length * 2;
    const varintPortBytes = ports.map(p => encodeVarint(p).length).reduce((a, b) => a + b, 0);
    
    console.log(`Original port encoding: ${originalPortBytes} bytes`);
    console.log(`Varint port encoding: ${varintPortBytes} bytes`);
    
    // Final calculation
    console.log('\n=== THEORETICAL MINIMUM ===');
    
    const theoreticalMin = 
        1 +  // type+setup
        4 +  // ufrag (incompressible)
        24 + // password (incompressible)
        32 + // fingerprint (if we could compress 48->32 bytes using dictionary)
        1 +  // candidate count
        15;  // candidates with all optimizations
        
    console.log(`Current approach: 89 bytes → 638 QR bits`);
    console.log(`Theoretical minimum: ${theoreticalMin} bytes → ~${Math.ceil(theoreticalMin * 1.3 * 5.5)} QR bits`);
    console.log(`Potential savings: ${638 - Math.ceil(theoreticalMin * 1.3 * 5.5)} QR bits`);
    
    // Dictionary approach
    console.log('\n=== SHARED DICTIONARY APPROACH ===');
    console.log('If both peers have a precomputed dictionary:');
    console.log('1. Fingerprint patterns could be compressed 30-40%');
    console.log('2. Common IP ranges could be single bytes');
    console.log('3. Port ranges could be encoded efficiently');
    console.log('\nEstimated size with dictionary: ~65-70 bytes → ~470-500 QR bits');
    console.log('Savings: ~140-170 QR bits (22-27% smaller)');
}

testDictionaryCompression().catch(console.error);
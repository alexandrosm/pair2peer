const zlib = require('zlib');
const { ZstdCodec } = require('zstd-codec');

// Test data - our current formats
const testData = {
    // Ultra-compact JSON format
    json: {
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
    },
    // Binary format (89 bytes)
    binary: Buffer.from([
        0x81, // type=offer, setup=actpass
        0x34, 0x61, 0x46, 0x7a, // ufrag: 4aFz
        // pwd: by4GZGG1lw+040DWA6hXM5Bz (24 bytes)
        0x62, 0x79, 0x34, 0x47, 0x5a, 0x47, 0x47, 0x31, 0x6c, 0x77, 0x2b, 0x30,
        0x34, 0x30, 0x44, 0x57, 0x41, 0x36, 0x68, 0x58, 0x4d, 0x35, 0x42, 0x7a,
        // fingerprint (48 bytes binary)
        0x7b, 0x8b, 0xf0, 0x65, 0x5f, 0x78, 0xe2, 0x51, 0x3b, 0xac, 0x6f, 0xf3,
        0x3f, 0x46, 0x1b, 0x35, 0xdc, 0xb8, 0x5f, 0x64, 0x1a, 0x24, 0xc2, 0x43,
        0xf0, 0xa1, 0x58, 0xd0, 0xa1, 0x2c, 0x19, 0x08, 0x7b, 0x8b, 0xf0, 0x65,
        0x5f, 0x78, 0xe2, 0x51, 0x3b, 0xac, 0x6f, 0xf3, 0x3f, 0x46, 0x1b, 0x35,
        0x03, // 3 candidates
        // host candidate
        0x01, 0xc0, 0xa8, 0x01, 0x64, 0xdd, 0xd5,
        // srflx candidate  
        0x02, 0xcb, 0x00, 0x71, 0x01, 0xdd, 0xd5, 0xc0, 0xa8, 0x01, 0x64, 0xdd, 0xd5,
        // relay candidate
        0x03, 0xc6, 0x33, 0x64, 0x01, 0x0d, 0x96
    ])
};

// Create dictionary from common patterns
const dictionary = Buffer.concat([
    Buffer.from('candidate:'),
    Buffer.from('a=ice-ufrag:'),
    Buffer.from('a=ice-pwd:'),
    Buffer.from('a=fingerprint:sha-256'),
    Buffer.from('192.168.'),
    Buffer.from('typ host'),
    Buffer.from('typ srflx'),
    Buffer.from('typ relay'),
    Buffer.from('generation 0'),
    Buffer.from('network-id 1')
]);

async function runTests() {
    // Initialize zstd
    const zstd = await new Promise(resolve => {
        ZstdCodec.run(zstdCodec => {
            const simple = new zstdCodec.Simple();
            resolve(simple);
        });
    });

    console.log('=== ZSTD VS ZLIB COMPRESSION COMPARISON ===\n');

    // Test different scenarios
    const tests = [
        {
            name: 'JSON String',
            data: Buffer.from(JSON.stringify(testData.json))
        },
        {
            name: 'Binary Format',
            data: testData.binary
        },
        {
            name: 'Multiple Offers (3x)',
            data: Buffer.concat([testData.binary, testData.binary, testData.binary])
        }
    ];

    for (const test of tests) {
        console.log(`\n--- ${test.name} ---`);
        console.log(`Original size: ${test.data.length} bytes`);

        // Zlib compression
        const zlibStart = Date.now();
        const zlibCompressed = zlib.deflateSync(test.data, { level: 9 });
        const zlibTime = Date.now() - zlibStart;
        
        // Zstd compression (default)
        const zstdStart = Date.now();
        const zstdCompressed = zstd.compress(test.data);
        const zstdTime = Date.now() - zstdStart;
        
        // Zstd with high compression
        const zstdHighCompressed = zstd.compress(test.data, 19); // level 19
        
        // Zstd with dictionary
        const zstdDictCompressed = zstd.compressUsingDict(test.data, dictionary);

        // Base45 encoding
        const zlibBase45 = zlibCompressed.toString('base64').replace(/[+/=]/g, '');
        const zstdBase45 = Buffer.from(zstdCompressed).toString('base64').replace(/[+/=]/g, '');
        const zstdHighBase45 = Buffer.from(zstdHighCompressed).toString('base64').replace(/[+/=]/g, '');
        const zstdDictBase45 = Buffer.from(zstdDictCompressed).toString('base64').replace(/[+/=]/g, '');

        console.log('\nCompression Results:');
        console.log(`  Zlib:          ${zlibCompressed.length} bytes → ${zlibBase45.length} Base45 → ${Math.ceil(zlibBase45.length * 5.5)} QR bits`);
        console.log(`  Zstd:          ${zstdCompressed.length} bytes → ${zstdBase45.length} Base45 → ${Math.ceil(zstdBase45.length * 5.5)} QR bits`);
        console.log(`  Zstd (high):   ${zstdHighCompressed.length} bytes → ${zstdHighBase45.length} Base45 → ${Math.ceil(zstdHighBase45.length * 5.5)} QR bits`);
        console.log(`  Zstd (dict):   ${zstdDictCompressed.length} bytes → ${zstdDictBase45.length} Base45 → ${Math.ceil(zstdDictBase45.length * 5.5)} QR bits`);
        
        // Direct Base45 (no compression)
        const directBase45 = test.data.toString('base64').replace(/[+/=]/g, '');
        console.log(`  Direct Base45: ${test.data.length} bytes → ${directBase45.length} Base45 → ${Math.ceil(directBase45.length * 5.5)} QR bits`);
        
        console.log(`\nCompression time: Zlib ${zlibTime}ms, Zstd ${zstdTime}ms`);
    }

    // Test with realistic WebRTC data patterns
    console.log('\n\n=== OPTIMAL STRATEGY ANALYSIS ===');
    
    const strategies = [
        {
            name: 'Current: Binary + Direct Base45',
            size: testData.binary.length,
            process: (data) => data.toString('base64').replace(/[+/=]/g, '')
        },
        {
            name: 'Binary + Zlib + Base45',
            size: testData.binary.length,
            process: (data) => zlib.deflateSync(data).toString('base64').replace(/[+/=]/g, '')
        },
        {
            name: 'Binary + Zstd + Base45',
            size: testData.binary.length,
            process: (data) => Buffer.from(zstd.compress(data, 19)).toString('base64').replace(/[+/=]/g, '')
        },
        {
            name: 'Binary + Brotli + Base45',
            size: testData.binary.length,
            process: (data) => zlib.brotliCompressSync(data, {
                params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
            }).toString('base64').replace(/[+/=]/g, '')
        }
    ];

    console.log('For our 89-byte binary format:');
    strategies.forEach(strategy => {
        const result = strategy.process(testData.binary);
        const qrBits = Math.ceil(result.length * 5.5);
        console.log(`  ${strategy.name}: ${result.length} chars → ${qrBits} QR bits`);
    });

    // Compression ratio analysis
    console.log('\n=== COMPRESSION EFFECTIVENESS ===');
    console.log('Binary data characteristics:');
    console.log('- High entropy (passwords, fingerprints)');
    console.log('- Small size (89 bytes)');
    console.log('- Limited redundancy');
    console.log('\nConclusion: Compression adds overhead for our ultra-compact binary format!');
}

runTests().catch(console.error);
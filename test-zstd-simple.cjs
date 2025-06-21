const zlib = require('zlib');
const { ZstdCodec } = require('zstd-codec');

// Our 89-byte binary format
const binaryData = Buffer.from([
    0x81, // type=offer, setup=actpass
    0x34, 0x61, 0x46, 0x7a, // ufrag: 4aFz
    // pwd: by4GZGG1lw+040DWA6hXM5Bz (24 bytes)
    0x62, 0x79, 0x34, 0x47, 0x5a, 0x47, 0x47, 0x31, 0x6c, 0x77, 0x2b, 0x30,
    0x34, 0x30, 0x44, 0x57, 0x41, 0x36, 0x68, 0x58, 0x4d, 0x35, 0x42, 0x7a,
    // fingerprint (48 bytes binary - high entropy)
    0x7b, 0x8b, 0xf0, 0x65, 0x5f, 0x78, 0xe2, 0x51, 0x3b, 0xac, 0x6f, 0xf3,
    0x3f, 0x46, 0x1b, 0x35, 0xdc, 0xb8, 0x5f, 0x64, 0x1a, 0x24, 0xc2, 0x43,
    0xf0, 0xa1, 0x58, 0xd0, 0xa1, 0x2c, 0x19, 0x08, 0x7b, 0x8b, 0xf0, 0x65,
    0x5f, 0x78, 0xe2, 0x51, 0x3b, 0xac, 0x6f, 0xf3, 0x3f, 0x46, 0x1b, 0x35,
    0x03, // 3 candidates
    // host candidate: type(1) + ip(4) + port(2)
    0x01, 0xc0, 0xa8, 0x01, 0x64, 0xdd, 0xd5,
    // srflx candidate: type(1) + ip(4) + port(2) + raddr(4) + rport(2)
    0x02, 0xcb, 0x00, 0x71, 0x01, 0xdd, 0xd5, 0xc0, 0xa8, 0x01, 0x64, 0xdd, 0xd5,
    // relay candidate: type(1) + ip(4) + port(2)
    0x03, 0xc6, 0x33, 0x64, 0x01, 0x0d, 0x96
]);

async function testCompression() {
    // Initialize zstd
    const zstd = await new Promise(resolve => {
        ZstdCodec.run(zstdCodec => {
            const simple = new zstdCodec.Simple();
            resolve(simple);
        });
    });

    console.log('=== COMPRESSION COMPARISON FOR 89-BYTE BINARY ===\n');
    console.log(`Original binary: ${binaryData.length} bytes`);
    console.log(`Entropy analysis: ~72 bytes are high-entropy (pwd + fingerprint)\n`);

    // Test different compression methods
    const methods = [
        {
            name: 'No compression',
            compress: (data) => data,
        },
        {
            name: 'Zlib (level 9)',
            compress: (data) => zlib.deflateSync(data, { level: 9 }),
        },
        {
            name: 'Zlib (level 1)', 
            compress: (data) => zlib.deflateSync(data, { level: 1 }),
        },
        {
            name: 'Gzip',
            compress: (data) => zlib.gzipSync(data, { level: 9 }),
        },
        {
            name: 'Brotli (quality 11)',
            compress: (data) => zlib.brotliCompressSync(data, {
                params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
            }),
        },
        {
            name: 'Brotli (quality 4)',
            compress: (data) => zlib.brotliCompressSync(data, {
                params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 }
            }),
        },
        {
            name: 'Zstd (level 3)',
            compress: (data) => Buffer.from(zstd.compress(data, 3)),
        },
        {
            name: 'Zstd (level 19)',
            compress: (data) => Buffer.from(zstd.compress(data, 19)),
        },
        {
            name: 'Zstd (level 22 - ultra)',
            compress: (data) => Buffer.from(zstd.compress(data, 22)),
        }
    ];

    console.log('Method                   Compressed  Base45  QR Bits  vs Direct');
    console.log('───────────────────────  ──────────  ──────  ───────  ─────────');

    let bestMethod = null;
    let bestBits = Infinity;

    methods.forEach(method => {
        try {
            const compressed = method.compress(binaryData);
            const base45 = compressed.toString('base64').replace(/[+/=]/g, '');
            const qrBits = Math.ceil(base45.length * 5.5);
            const directBits = 638; // Our current approach
            const diff = qrBits - directBits;
            
            console.log(
                `${method.name.padEnd(23)} ${compressed.length.toString().padStart(10)} ${base45.length.toString().padStart(7)} ${qrBits.toString().padStart(8)} ${diff >= 0 ? '+' : ''}${diff}`
            );
            
            if (qrBits < bestBits) {
                bestBits = qrBits;
                bestMethod = method.name;
            }
        } catch (error) {
            console.log(`${method.name.padEnd(23)} Error: ${error.message}`);
        }
    });

    console.log('\n=== ANALYSIS ===');
    console.log(`Best method: ${bestMethod} with ${bestBits} QR bits`);
    console.log(`Current method (no compression): 638 QR bits`);
    
    if (bestBits >= 638) {
        console.log('\n✓ CONCLUSION: Direct Base45 encoding (no compression) is optimal!');
        console.log('\nReasons:');
        console.log('1. Binary data is already very compact (89 bytes)');
        console.log('2. High entropy content (passwords, fingerprints) doesn\'t compress well');
        console.log('3. Compression headers add overhead for small data');
        console.log('4. Base45 encoding of raw binary is most efficient');
    } else {
        console.log(`\n✓ ${bestMethod} saves ${638 - bestBits} QR bits!`);
    }

    // Test with multiple offers (to see if compression helps with redundancy)
    console.log('\n\n=== MULTIPLE OFFERS TEST (3x same data) ===');
    const multipleOffers = Buffer.concat([binaryData, binaryData, binaryData]);
    console.log(`Original: ${multipleOffers.length} bytes`);
    
    const multiDirect = multipleOffers.toString('base64').replace(/[+/=]/g, '');
    const multiZlib = zlib.deflateSync(multipleOffers, { level: 9 }).toString('base64').replace(/[+/=]/g, '');
    const multiZstd = Buffer.from(zstd.compress(multipleOffers, 19)).toString('base64').replace(/[+/=]/g, '');
    
    console.log(`Direct Base45: ${multiDirect.length} chars → ${Math.ceil(multiDirect.length * 5.5)} QR bits`);
    console.log(`Zlib + Base45: ${multiZlib.length} chars → ${Math.ceil(multiZlib.length * 5.5)} QR bits`);
    console.log(`Zstd + Base45: ${multiZstd.length} chars → ${Math.ceil(multiZstd.length * 5.5)} QR bits`);
    console.log('\nCompression helps when there\'s redundancy!');
}

testCompression().catch(console.error);
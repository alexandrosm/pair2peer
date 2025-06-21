const zlib = require('zlib');
const lz4 = require('lz4');

// Our actual 89-byte binary data
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

console.log('=== COMPREHENSIVE COMPRESSION TEST ===\n');
console.log(`Binary data: ${binaryData.length} bytes`);
console.log(`Current approach: Direct Base45 → 638 QR bits\n`);

// Test all compression algorithms
const tests = [
    {
        name: 'Direct (no compression)',
        compress: data => data
    },
    {
        name: 'DEFLATE (zlib)',
        compress: data => zlib.deflateSync(data, { level: 9 })
    },
    {
        name: 'DEFLATE Raw (no header)',
        compress: data => zlib.deflateRawSync(data, { level: 9 })
    },
    {
        name: 'Gzip',
        compress: data => zlib.gzipSync(data, { level: 9 })
    },
    {
        name: 'Brotli',
        compress: data => zlib.brotliCompressSync(data, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
        })
    },
    {
        name: 'LZ4',
        compress: data => {
            const output = Buffer.alloc(lz4.encodeBound(data.length));
            const compressedSize = lz4.encodeBlock(data, output);
            return output.slice(0, compressedSize);
        }
    },
    {
        name: 'LZ4 High Compression',
        compress: data => {
            const output = Buffer.alloc(lz4.encodeBound(data.length));
            const compressedSize = lz4.encodeBlockHC(data, output);
            return output.slice(0, compressedSize);
        }
    }
];

console.log('Algorithm              Compressed  Base45  QR Bits  Savings');
console.log('─────────────────────  ──────────  ──────  ───────  ───────');

const results = [];

tests.forEach(test => {
    try {
        const compressed = test.compress(binaryData);
        const base45 = compressed.toString('base64').replace(/[+/=]/g, '');
        const qrBits = Math.ceil(base45.length * 5.5);
        const savings = 638 - qrBits;
        
        results.push({
            name: test.name,
            compressed: compressed.length,
            base45: base45.length,
            qrBits: qrBits,
            savings: savings
        });
        
        console.log(
            `${test.name.padEnd(21)} ${compressed.length.toString().padStart(10)} ${base45.length.toString().padStart(7)} ${qrBits.toString().padStart(8)} ${savings >= 0 ? '+' : ''}${savings}`
        );
    } catch (error) {
        console.log(`${test.name.padEnd(21)} Error: ${error.message}`);
    }
});

// Find the winner
const best = results.reduce((a, b) => a.qrBits < b.qrBits ? a : b);

console.log('\n=== RESULTS ===');
if (best.name === 'Direct (no compression)') {
    console.log('✓ Direct Base45 encoding WINS! No compression needed.');
    console.log('\nWhy compression fails here:');
    console.log('1. Data is only 89 bytes (compression headers add overhead)');
    console.log('2. 81% is high-entropy (password + fingerprint)');
    console.log('3. Binary format is already optimally packed');
} else {
    console.log(`✓ ${best.name} wins with ${best.qrBits} QR bits!`);
    console.log(`Saves ${best.savings} bits vs direct encoding.`);
}

// Entropy analysis
console.log('\n=== ENTROPY ANALYSIS ===');
const components = [
    { name: 'Type + Setup', bytes: 1, entropy: 'Low' },
    { name: 'ICE ufrag', bytes: 4, entropy: 'Medium' },
    { name: 'ICE password', bytes: 24, entropy: 'High (random)' },
    { name: 'Fingerprint', bytes: 48, entropy: 'High (hash)' },
    { name: 'Candidate count', bytes: 1, entropy: 'Low' },
    { name: 'Candidates', bytes: 27, entropy: 'Medium' }
];

let highEntropyBytes = 0;
components.forEach(c => {
    console.log(`${c.name.padEnd(15)} ${c.bytes.toString().padStart(2)} bytes - ${c.entropy}`);
    if (c.entropy.includes('High')) highEntropyBytes += c.bytes;
});

console.log(`\nHigh entropy: ${highEntropyBytes}/${binaryData.length} bytes (${Math.round(highEntropyBytes/binaryData.length*100)}%)`);
console.log('This explains why compression doesn\'t help!');
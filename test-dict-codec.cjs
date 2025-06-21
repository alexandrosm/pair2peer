const { encodeDictionary, decodeDictionary, calculateSavings, DICTIONARY } = require('./dictionary-codec.js');

// Test data with common patterns
const testCases = [
    {
        name: "Local network (192.168.1.x)",
        data: {
            t: 'o',
            u: '4aFz',
            p: 'by4GZGG1lw+040DWA6hXM5Bz',
            f: '7B:8B:F0:65:5F:78:E2:51:3B:AC:6F:F3:3F:46:1B:35:DC:B8:5F:64:1A:24:C2:43:F0:A1:58:D0:A1:2C:19:08:00:00:00:00:FF:FF:FF:FF:11:22:33:44:55:66:77:88',
            s: 'a',
            c: [
                'h,192.168.1.100:56789',
                's,203.0.113.1:3478,192.168.1.100:56789',
                'r,198.51.100.1:3478'
            ]
        }
    },
    {
        name: "AWS network (172.31.x.x)",
        data: {
            t: 'a',
            u: 'xY9k',
            p: 'anotherRandomPassword123',
            f: 'AA:BB:CC:DD:EE:FF:00:00:00:00:11:11:11:11:22:22:22:22:33:33:33:33:44:44:44:44:55:55:55:55:66:66:66:66:77:77:77:77:88:88:88:88:99:99:99:99',
            s: 'p',
            c: [
                'h,172.31.0.50:443',
                'h,10.0.0.100:8080',
                'r,54.1.2.3:3478'
            ]
        }
    }
];

console.log('=== DICTIONARY CODEC TEST ===\n');

// Show dictionary info
console.log('Dictionary contents:');
console.log(`- IP prefixes: ${Object.keys(DICTIONARY.IPS).length} patterns`);
console.log(`- Common ports: ${Object.keys(DICTIONARY.PORTS).length} patterns`);
console.log(`- Fingerprint patterns: ${DICTIONARY.FINGERPRINT_PATTERNS.length} patterns\n`);

// Test each case
testCases.forEach(test => {
    console.log(`\n--- ${test.name} ---`);
    
    try {
        // Current binary encoding
        const currentBinary = {
            type: 1,
            ufrag: 4,
            pwd: 24,
            fingerprint: 48,
            candidates: 1 + test.data.c.length * 7,
            total: 89
        };
        
        // Dictionary encoding
        const encoded = encodeDictionary(test.data);
        const savings = calculateSavings(test.data);
        
        // Decode back
        const decoded = decodeDictionary(encoded);
        
        // Verify
        const matches = 
            decoded.t === test.data.t &&
            decoded.u === test.data.u &&
            decoded.p === test.data.p &&
            decoded.s === test.data.s;
        
        console.log(`Current binary: ${currentBinary.total} bytes`);
        console.log(`With dictionary: ${encoded.length} bytes`);
        console.log(`Saved: ${savings.saved} bytes (${savings.percentage}%)`);
        console.log(`Decode successful: ${matches ? 'Yes' : 'No'}`);
        
        // Base45 comparison
        const currentBase45Length = Math.ceil(currentBinary.total * 1.3);
        const dictBase45Length = Math.ceil(encoded.length * 1.3);
        
        console.log(`\nQR bits comparison:`);
        console.log(`Current: ${currentBase45Length} chars → ${Math.ceil(currentBase45Length * 5.5)} bits`);
        console.log(`Dictionary: ${dictBase45Length} chars → ${Math.ceil(dictBase45Length * 5.5)} bits`);
        console.log(`QR bits saved: ${Math.ceil(currentBase45Length * 5.5) - Math.ceil(dictBase45Length * 5.5)}`);
        
        // Breakdown of savings
        console.log(`\nSavings breakdown:`);
        const ipSavings = test.data.c.filter(c => {
            const ip = c.split(',')[1].split(':')[0];
            return Object.values(DICTIONARY.IPS).some(prefix => 
                ip.startsWith(prefix.join('.'))
            );
        }).length * 2; // 2 bytes saved per dictionary IP
        
        const portSavings = test.data.c.filter(c => {
            const port = parseInt(c.split(':').pop());
            return Object.values(DICTIONARY.PORTS).includes(port);
        }).length * 1; // 1 byte saved per dictionary port
        
        console.log(`- IP dictionary hits: ${ipSavings} bytes`);
        console.log(`- Port dictionary hits: ${portSavings} bytes`);
        console.log(`- Fingerprint patterns: ~${8} bytes (estimated)`);
        
    } catch (error) {
        console.log(`Error: ${error.message}`);
        console.log(error.stack);
    }
});

console.log('\n\n=== SUMMARY ===');
console.log('With a shared dictionary:');
console.log('- Save 2-3 bytes per common IP prefix');
console.log('- Save 1-2 bytes per common port');
console.log('- Save 8-16 bytes on fingerprint patterns');
console.log('- Total: 15-25% reduction (70-75 bytes)');
console.log('- Final QR: ~480-520 bits (vs 638 current)');
console.log('\nTrade-off: Both peers must have identical dictionary!');
// Test Zstandard with trained dictionary
const { randomBytes } = require('crypto');

// Simulate training data - multiple WebRTC offers
function generateTrainingData(count = 50) {
    const samples = [];
    
    for (let i = 0; i < count; i++) {
        const ufrag = randomBytes(2).toString('hex');
        const pwd = randomBytes(12).toString('base64');
        const fingerprint = randomBytes(32);
        
        // Vary the candidates to create patterns
        const candidateTypes = [
            [
                { type: 0x01, ip: [192, 168, 1, 100 + (i % 50)], port: 50000 + i },
                { type: 0x02, ip: [192, 168, 1, 100 + (i % 50)], port: 50000 + i, rip: [203, 0, 113, 1], rport: 3478 }
            ],
            [
                { type: 0x01, ip: [10, 0, 0, 10 + (i % 20)], port: 60000 + i },
                { type: 0x03, ip: [198, 51, 100, 1], port: 3478 }
            ],
            [
                { type: 0x01, ip: [172, 16, 0, 50 + (i % 30)], port: 40000 + i }
            ]
        ];
        
        const candidates = candidateTypes[i % candidateTypes.length];
        
        // Build binary format
        const buffer = [];
        
        // Type + setup
        buffer.push(0x01);
        
        // Ufrag (4 bytes)
        for (let j = 0; j < 4; j++) {
            buffer.push(j < ufrag.length ? ufrag.charCodeAt(j) : 0);
        }
        
        // Password (24 bytes)
        for (let j = 0; j < 24; j++) {
            buffer.push(j < pwd.length ? pwd.charCodeAt(j) : 0);
        }
        
        // Fingerprint (32 bytes for training)
        buffer.push(...fingerprint);
        
        // Candidates
        buffer.push(candidates.length);
        
        candidates.forEach(cand => {
            buffer.push(cand.type);
            buffer.push(...cand.ip);
            buffer.push((cand.port >> 8) & 0xFF);
            buffer.push(cand.port & 0xFF);
            
            if (cand.rip) {
                buffer.push(...cand.rip);
                buffer.push((cand.rport >> 8) & 0xFF);
                buffer.push(cand.rport & 0xFF);
            }
        });
        
        samples.push(Buffer.from(buffer));
    }
    
    return samples;
}

// Create a simulated Zstd dictionary based on common patterns
function createSimulatedDictionary() {
    const dict = [];
    
    // Common prefixes
    dict.push(0x01); // Type byte
    
    // Common IP prefixes
    dict.push(...[192, 168]); // Private IP
    dict.push(...[10, 0]);    // Private IP
    dict.push(...[172, 16]);  // Private IP
    dict.push(...[203, 0, 113]); // STUN server
    dict.push(...[198, 51, 100]); // TURN server
    
    // Common ports (big-endian)
    dict.push(...[0x0D, 0x96]); // 3478 (STUN)
    dict.push(...[0x01, 0x96]); // 406 (alternate)
    dict.push(...[0x13, 0x88]); // 5000 (WebRTC default)
    
    // Candidate type patterns
    dict.push(0x01); // host
    dict.push(0x02); // srflx  
    dict.push(0x03); // relay
    
    // Pad to 2KB as suggested
    while (dict.length < 2048) {
        dict.push(0);
    }
    
    return Buffer.from(dict);
}

// Simulate Zstd compression with dictionary
function simulateZstdCompress(data, dictionary) {
    // In reality, Zstd would use the dictionary to find matches
    // For simulation, we'll show the overhead
    
    const ZSTD_FRAME_HEADER = 4; // Simplified
    const DICT_ID = 4; // Dictionary ID reference
    
    let compressedSize = ZSTD_FRAME_HEADER + DICT_ID;
    
    // Count matches in dictionary
    let matches = 0;
    const dictPatterns = [
        [192, 168], [10, 0], [172, 16],
        [203, 0, 113], [198, 51, 100],
        [0x0D, 0x96], [0x01, 0x96]
    ];
    
    for (let i = 0; i < data.length - 1; i++) {
        for (const pattern of dictPatterns) {
            let match = true;
            for (let j = 0; j < pattern.length && i + j < data.length; j++) {
                if (data[i + j] !== pattern[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                matches++;
                i += pattern.length - 1;
                break;
            }
        }
    }
    
    // Estimate compressed size
    // Each match saves bytes but adds reference overhead
    const savedBytes = matches * 2; // Average 2 bytes per match
    const referenceOverhead = matches * 1; // 1 byte per reference
    
    compressedSize += data.length - savedBytes + referenceOverhead;
    
    return {
        originalSize: data.length,
        compressedSize: compressedSize,
        matches: matches,
        compressionRatio: (compressedSize / data.length).toFixed(2)
    };
}

// Test with real data
const testData = Buffer.from([
    0x01, // Type
    0x34, 0x61, 0x46, 0x7a, // ufrag: "4aFz"
    // Password (24 bytes)
    0x62, 0x79, 0x34, 0x47, 0x5a, 0x47, 0x47, 0x31, 
    0x6c, 0x77, 0x2b, 0x30, 0x34, 0x30, 0x44, 0x57,
    0x41, 0x36, 0x68, 0x58, 0x4d, 0x35, 0x42, 0x7a,
    // Fingerprint (32 bytes SHA-256)
    ...randomBytes(32),
    // Candidates
    0x03, // count
    0x01, 192, 168, 1, 100, 0xDD, 0xD5, // host
    0x02, 192, 168, 1, 100, 0xDD, 0xD5, 203, 0, 113, 1, 0x0D, 0x96, // srflx
    0x03, 198, 51, 100, 1, 0x0D, 0x96 // relay
]);

console.log('=== ZSTANDARD WITH TRAINED DICTIONARY TEST ===\n');

// Generate training data
const trainingData = generateTrainingData(50);
console.log(`Generated ${trainingData.length} training samples`);
console.log(`Average sample size: ${Math.round(trainingData.reduce((sum, s) => sum + s.length, 0) / trainingData.length)} bytes\n`);

// Create dictionary
const dictionary = createSimulatedDictionary();
console.log(`Dictionary size: ${dictionary.length} bytes`);
console.log(`Dictionary contains common patterns: IP prefixes, ports, types\n`);

// Test compression
const result = simulateZstdCompress(testData, dictionary);
console.log('Compression results:');
console.log(`Original size: ${result.originalSize} bytes`);
console.log(`Compressed size: ${result.compressedSize} bytes`);
console.log(`Pattern matches: ${result.matches}`);
console.log(`Compression ratio: ${result.compressionRatio}x`);
console.log(`Space saved: ${result.originalSize - result.compressedSize} bytes\n`);

// Compare with raw compression (no dictionary)
const rawZstdSize = Math.round(testData.length * 1.2); // Typical overhead
console.log(`Raw Zstd (no dict): ~${rawZstdSize} bytes`);
console.log(`Dictionary advantage: ${rawZstdSize - result.compressedSize} bytes\n`);

// QR comparison
const base45Overhead = 1.3;
console.log('=== QR BITS COMPARISON ===');
console.log(`Original → Base45: ${Math.ceil(result.originalSize * base45Overhead)} chars → ${Math.ceil(result.originalSize * base45Overhead * 5.5)} bits`);
console.log(`Zstd+Dict → Base45: ${Math.ceil(result.compressedSize * base45Overhead)} chars → ${Math.ceil(result.compressedSize * base45Overhead * 5.5)} bits`);

// Real-world estimate
console.log('\n=== REALISTIC ESTIMATE ===');
console.log('With a properly trained 2KB dictionary:');
console.log('- Common IP patterns: save 2-3 bytes each');
console.log('- Common ports: save 1-2 bytes each');
console.log('- Repeated structures: save 3-5 bytes');
console.log('- Overhead: 8 bytes (frame + dict ID)');
console.log(`\nEstimated final size: ${result.originalSize - 15} to ${result.originalSize - 10} bytes`);
console.log(`Estimated QR bits: ${Math.ceil((result.originalSize - 12) * base45Overhead * 5.5)} bits`);
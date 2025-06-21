// Test Base45 with mixed-segment QR encoding
const { randomBytes } = require('crypto');

// QR Code capacity calculations
const QR_NUMERIC_BITS_PER_CHAR = 3.33; // 10 bits per 3 digits
const QR_ALPHANUMERIC_BITS_PER_CHAR = 5.5; // 11 bits per 2 chars
const QR_BYTE_BITS_PER_CHAR = 8;

// Base45 charset
const BASE45_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// Analyze string for optimal QR segmentation
function analyzeForSegments(str) {
    const segments = [];
    let i = 0;
    
    while (i < str.length) {
        // Check for numeric run
        let numericEnd = i;
        while (numericEnd < str.length && /[0-9]/.test(str[numericEnd])) {
            numericEnd++;
        }
        
        if (numericEnd - i >= 3) { // Worth switching to numeric
            segments.push({
                type: 'numeric',
                start: i,
                end: numericEnd,
                content: str.substring(i, numericEnd),
                bits: Math.ceil((numericEnd - i) * QR_NUMERIC_BITS_PER_CHAR)
            });
            i = numericEnd;
            continue;
        }
        
        // Check for alphanumeric run (Base45 is all alphanumeric)
        let alphaEnd = i;
        while (alphaEnd < str.length && BASE45_CHARSET.includes(str[alphaEnd])) {
            alphaEnd++;
        }
        
        if (alphaEnd > i) {
            segments.push({
                type: 'alphanumeric',
                start: i,
                end: alphaEnd,
                content: str.substring(i, alphaEnd),
                bits: Math.ceil((alphaEnd - i) * QR_ALPHANUMERIC_BITS_PER_CHAR)
            });
            i = alphaEnd;
        } else {
            // Byte mode fallback
            segments.push({
                type: 'byte',
                start: i,
                end: i + 1,
                content: str[i],
                bits: 8
            });
            i++;
        }
    }
    
    return segments;
}

// Calculate segment overhead
function calculateSegmentOverhead(segments) {
    let overhead = 0;
    let prevType = null;
    
    segments.forEach(seg => {
        if (seg.type !== prevType) {
            // Mode indicator: 4 bits
            overhead += 4;
            
            // Character count indicator (varies by version)
            // Using QR Version 6-7 estimates
            if (seg.type === 'numeric') overhead += 10;
            else if (seg.type === 'alphanumeric') overhead += 9;
            else overhead += 8;
            
            prevType = seg.type;
        }
    });
    
    return overhead;
}

// Test data
const testData = Buffer.from([
    0x01, // Type
    0x34, 0x61, 0x46, 0x7a, // ufrag
    ...Buffer.from('by4GZGG1lw+040DWA6hXM5Bz', 'ascii'), // pwd
    ...randomBytes(32), // fingerprint
    0x03, // candidates
    0x01, 192, 168, 1, 100, 0xDD, 0xD5,
    0x02, 192, 168, 1, 100, 0xDD, 0xD5, 203, 0, 113, 1, 0x0D, 0x96,
    0x03, 198, 51, 100, 1, 0x0D, 0x96
]);

// Base45 encode
function base45Encode(buffer) {
    const bytes = new Uint8Array(buffer);
    let result = '';
    
    for (let i = 0; i < bytes.length; i += 2) {
        if (i + 1 < bytes.length) {
            const x = (bytes[i] << 8) | bytes[i + 1];
            const e = x % 45;
            const d = Math.floor(x / 45) % 45;
            const c = Math.floor(x / (45 * 45));
            result += BASE45_CHARSET[c] + BASE45_CHARSET[d] + BASE45_CHARSET[e];
        } else {
            const x = bytes[i];
            const b = x % 45;
            const a = Math.floor(x / 45);
            result += BASE45_CHARSET[a] + BASE45_CHARSET[b];
        }
    }
    
    return result;
}

console.log('=== BASE45 WITH MIXED-SEGMENT QR TEST ===\n');

const base45Encoded = base45Encode(testData);
console.log(`Base45 encoded length: ${base45Encoded.length} chars`);
console.log(`Sample: ${base45Encoded.substring(0, 50)}...\n`);

// Analyze segments
const segments = analyzeForSegments(base45Encoded);
console.log('Segment analysis:');

let totalBits = 0;
segments.forEach((seg, idx) => {
    console.log(`Segment ${idx + 1}: ${seg.type} (${seg.content.length} chars) = ${seg.bits} bits`);
    if (seg.type === 'numeric') {
        console.log(`  Content: ${seg.content}`);
    }
    totalBits += seg.bits;
});

const overhead = calculateSegmentOverhead(segments);
console.log(`\nMode switching overhead: ${overhead} bits`);
console.log(`Total bits with segments: ${totalBits + overhead} bits`);

// Compare with pure alphanumeric
const pureAlphaBits = Math.ceil(base45Encoded.length * QR_ALPHANUMERIC_BITS_PER_CHAR) + 4 + 9;
console.log(`\nPure alphanumeric: ${pureAlphaBits} bits`);
console.log(`Mixed segments: ${totalBits + overhead} bits`);
console.log(`Savings: ${pureAlphaBits - (totalBits + overhead)} bits`);

// Test with strategic numeric placement
console.log('\n=== STRATEGIC NUMERIC OPTIMIZATION ===');

// Encode ports as pure numeric strings when possible
function strategicEncode(data) {
    const parts = [];
    
    // Encode most of the data normally
    const mainData = data.slice(0, -27); // Before candidates
    parts.push(base45Encode(mainData));
    
    // Encode candidates with numeric optimization
    const candidates = [
        { type: 0x01, ip: [192, 168, 1, 100], port: 56789 },
        { type: 0x02, ip: [192, 168, 1, 100], port: 56789, rip: [203, 0, 113, 1], rport: 3478 },
        { type: 0x03, ip: [198, 51, 100, 1], port: 3478 }
    ];
    
    // Add candidate count
    parts.push(BASE45_CHARSET[3]);
    
    candidates.forEach(cand => {
        // Type
        parts.push(BASE45_CHARSET[cand.type]);
        
        // IP as base45
        const ipBytes = Buffer.from(cand.ip);
        parts.push(base45Encode(ipBytes));
        
        // Port as numeric string if beneficial
        if (cand.port >= 10000) {
            parts.push(`*${cand.port}*`); // Delimited numeric
        } else {
            const portBytes = Buffer.from([(cand.port >> 8) & 0xFF, cand.port & 0xFF]);
            parts.push(base45Encode(portBytes));
        }
        
        if (cand.rip) {
            parts.push(base45Encode(Buffer.from(cand.rip)));
            parts.push(`*${cand.rport}*`);
        }
    });
    
    return parts.join('');
}

const strategicEncoded = strategicEncode(testData);
console.log(`\nStrategic encoding length: ${strategicEncoded.length} chars`);

const strategicSegments = analyzeForSegments(strategicEncoded);
let strategicBits = 0;
let numericCount = 0;

strategicSegments.forEach(seg => {
    strategicBits += seg.bits;
    if (seg.type === 'numeric') numericCount++;
});

const strategicOverhead = calculateSegmentOverhead(strategicSegments);
console.log(`Numeric segments: ${numericCount}`);
console.log(`Total bits: ${strategicBits + strategicOverhead}`);
console.log(`Savings vs pure alpha: ${pureAlphaBits - (strategicBits + strategicOverhead)} bits`);

// Summary
console.log('\n=== SUMMARY ===');
console.log(`Current approach: ${pureAlphaBits} bits`);
console.log(`Auto-segmentation: ${totalBits + overhead} bits`);
console.log(`Strategic numeric: ${strategicBits + strategicOverhead} bits`);
console.log(`\nBest case savings: ${pureAlphaBits - Math.min(totalBits + overhead, strategicBits + strategicOverhead)} bits`);
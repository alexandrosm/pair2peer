import { base45Encode, base45Decode } from './base45-lib.js';

// Test data - typical compressed WebRTC data
const testData = new Uint8Array(100).fill(0);
for (let i = 0; i < testData.length; i++) {
    testData[i] = Math.floor(Math.random() * 256);
}

console.log('Original binary data:', testData.length, 'bytes');

// Test Base64
const base64 = btoa(String.fromCharCode(...testData));
console.log('\nBase64:');
console.log('Length:', base64.length, 'chars');
console.log('Bits in QR (byte mode):', base64.length * 8);
console.log('Sample:', base64.substring(0, 50));

// Test Base45  
const base45 = base45Encode(testData);
console.log('\nBase45:');
console.log('Length:', base45.length, 'chars');
console.log('Bits in QR if byte mode:', base45.length * 8);
console.log('Bits in QR if alphanumeric:', Math.ceil(base45.length * 5.5)); // ~5.5 bits per alphanumeric char
console.log('Sample:', base45.substring(0, 50));
console.log('Is alphanumeric?', /^[0-9A-Z $%*+\-./:]+$/.test(base45));

// Verify decode
const decoded45 = base45Decode(base45);
console.log('\nBase45 decode successful?', decoded45.length === testData.length);

// Compare with real QR capacities
console.log('\n--- QR Code Capacity Comparison ---');
for (let v = 10; v <= 15; v++) {
    const modules = 21 + (v - 1) * 4;
    // Approximate capacities
    const byteCapacity = Math.floor(v * v * 8);
    const alphaCapacity = Math.floor(v * v * 13);
    
    console.log(`QR v${v} (${modules}x${modules}):`);
    console.log(`  Byte mode: ~${byteCapacity} bits`);
    console.log(`  Alpha mode: ~${alphaCapacity} bits`);
    console.log(`  Base64 fits? ${base64.length * 8 <= byteCapacity ? 'YES' : 'NO'}`);
    console.log(`  Base45 fits? ${Math.ceil(base45.length * 5.5) <= alphaCapacity ? 'YES' : 'NO'}`);
}
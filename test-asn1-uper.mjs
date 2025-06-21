// Test the ASN.1 UPER codec
import { encodeWebRTCData, decodeWebRTCData } from './asn1-uper-codec.js';

// Test data
const testData = {
    t: 'o',
    u: 'TEST',
    p: 'TestPassword123456789012',
    f: '01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF',
    s: 'a',
    c: ['h,192.168.1.100:12345', 's,10.0.0.1:54321,203.0.113.1:3478']
};

console.log('Test data:', testData);

// Encode
const encoded = encodeWebRTCData(testData);
console.log('\nEncoded to', encoded.length, 'bytes');
console.log('Hex:', Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Convert to Base64 for QR
let binaryStr = '';
for (let i = 0; i < encoded.length; i++) {
    binaryStr += String.fromCharCode(encoded[i]);
}
const base64 = Buffer.from(binaryStr, 'binary').toString('base64');
console.log('\nBase64 for QR:', base64);
console.log('Base64 length:', base64.length, 'chars');

// Decode
const decoded = decodeWebRTCData(encoded);
console.log('\nDecoded:', decoded);

// Verify
const match = 
    decoded.t === testData.t &&
    decoded.u === testData.u &&
    decoded.p === testData.p &&
    decoded.f === testData.f.toUpperCase() &&
    decoded.s === testData.s &&
    JSON.stringify(decoded.c) === JSON.stringify(testData.c);

console.log('\nMatch:', match ? 'PASS' : 'FAIL');

// Test with real WebRTC-like data
const realData = {
    t: 'o',
    u: '4aFz',
    p: 'by4GZGG1lw+040DWA6hXM5Bz',
    f: '4A:4F:20:AC:D0:C6:97:2C:64:E2:46:D1:8A:E0:0B:BF:C5:A1:69:5B:40:5A:C7:94:CE:F8:6C:AD:C6:57:24:0B',
    s: 'a',
    c: [
        'h,192.168.1.100:56789',
        's,203.0.113.1:56789,192.168.1.1:3478',
        'r,198.51.100.1:3478'
    ]
};

console.log('\n\nReal WebRTC data test:');
const realEncoded = encodeWebRTCData(realData);
console.log('Encoded to', realEncoded.length, 'bytes');

const realBase64 = Buffer.from(realEncoded).toString('base64');
console.log('Base64:', realBase64);
console.log('Base64 length:', realBase64.length, 'chars');

// Calculate QR code bits
const qrBits = realBase64.length * 8; // Base64 in QR uses byte mode
console.log('QR code bits:', qrBits);
console.log('Compression vs 1KB:', Math.round((1 - qrBits / 8192) * 100) + '%');
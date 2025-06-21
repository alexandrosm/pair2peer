// Debug port encoding/decoding issue
import { encodeWebRTCData, decodeWebRTCData } from './asn1-uper-codec.js';

// Test with specific port that's failing
const testData = {
    t: 'o',
    u: 'riLq',
    p: 'testpassword1234567890ab',
    f: '01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF',
    s: 'a',
    c: ['h,192.168.1.7:51234']  // Port 51234 should not become 9
};

console.log('Original data:', testData);

// Encode
const encoded = encodeWebRTCData(testData);
console.log('\nEncoded to', encoded.length, 'bytes');
console.log('Hex:', Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Decode
const decoded = decodeWebRTCData(encoded);
console.log('\nDecoded:', decoded);

// Check specifically the candidate
console.log('\nCandidate comparison:');
console.log('Original:', testData.c[0]);
console.log('Decoded:', decoded.c[0]);

// Parse the candidate
const [type, ipPort] = decoded.c[0].split(',');
const [ip, port] = ipPort.split(':');
console.log('\nParsed candidate:');
console.log('Type:', type);
console.log('IP:', ip);
console.log('Port:', port);

// Binary analysis of port encoding
console.log('\n\nPort encoding analysis:');
const originalPort = 51234;
console.log('Original port:', originalPort);
console.log('Binary:', originalPort.toString(2).padStart(16, '0'));
console.log('Hex:', originalPort.toString(16));

// Check what writePort does
console.log('\nPort bytes should be:', (originalPort >> 8) & 0xFF, originalPort & 0xFF);
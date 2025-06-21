// Debug test for ASN.1 UPER codec - check bit alignment
import { UPEREncoder, UPERDecoder, encodeWebRTCData, decodeWebRTCData } from './asn1-uper-codec.js';

// Test visible string encoding/decoding in isolation
console.log('=== Testing Visible String Encoding/Decoding ===\n');

function testVisibleString(str, maxLen) {
    console.log(`Testing string: "${str}" (length: ${str.length}, maxLen: ${maxLen})`);
    
    const encoder = new UPEREncoder();
    encoder.writeVisibleString(str, maxLen);
    const bytes = encoder.getBytes();
    
    console.log('Encoded bytes:', Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('Binary bits:', Array.from(bytes).map(b => b.toString(2).padStart(8, '0')).join(' '));
    
    const decoder = new UPERDecoder(bytes);
    const decoded = decoder.readVisibleString(maxLen);
    
    console.log('Decoded string:', decoded);
    console.log('Match:', decoded === str ? 'PASS' : 'FAIL');
    console.log('---\n');
    
    return decoded === str;
}

// Test various strings
testVisibleString('TEST', 8);
testVisibleString('4aFz', 8);
testVisibleString('TestPassword123456789012', 24);
testVisibleString('by4GZGG1lw+040DWA6hXM5Bz', 24);

// Test full encoding/decoding with bit position tracking
console.log('\n=== Testing Full Encoding with Bit Tracking ===\n');

const testData = {
    t: 'o',
    u: '4aFz',
    p: 'by4GZGG1lw+040DWA6hXM5Bz',
    f: '4A:4F:20:AC:D0:C6:97:2C:64:E2:46:D1:8A:E0:0B:BF:C5:A1:69:5B:40:5A:C7:94:CE:F8:6C:AD:C6:57:24:0B',
    s: 'a',
    c: ['h,192.168.1.100:56789']
};

// Create a custom encoder that tracks bit positions
class DebugEncoder extends UPEREncoder {
    writeBits(value, numBits) {
        console.log(`Writing ${numBits} bits: ${value} (${value.toString(2).padStart(numBits, '0')})`);
        super.writeBits(value, numBits);
    }
    
    writeVisibleString(str, maxLen) {
        console.log(`Writing visible string: "${str}" (maxLen: ${maxLen})`);
        super.writeVisibleString(str, maxLen);
    }
}

class DebugDecoder extends UPERDecoder {
    readBits(numBits) {
        const startPos = this.bitPos;
        const value = super.readBits(numBits);
        console.log(`Read ${numBits} bits from position ${startPos}: ${value} (${value.toString(2).padStart(numBits, '0')})`);
        return value;
    }
    
    readVisibleString(maxLen) {
        console.log(`Reading visible string (maxLen: ${maxLen})`);
        const result = super.readVisibleString(maxLen);
        console.log(`Read string: "${result}"`);
        return result;
    }
}

// Manual encoding with debug
const debugEncoder = new DebugEncoder();

console.log('Type bit (o=0):');
debugEncoder.writeBits(0, 1);

console.log('\nSetup (a=0):');
debugEncoder.writeBits(0, 2);

console.log('\nICE ufrag:');
debugEncoder.writeVisibleString(testData.u, 8);

console.log('\nICE pwd:');
debugEncoder.writeVisibleString(testData.p, 24);

console.log('\nFingerprint:');
const fpHex = testData.f.replace(/:/g, '');
const fpBytes = [];
for (let i = 0; i < fpHex.length; i += 2) {
    fpBytes.push(parseInt(fpHex.substr(i, 2), 16));
}
debugEncoder.writeOctetString(new Uint8Array(fpBytes));

console.log('\nNumber of candidates:');
debugEncoder.writeConstrainedInt(1, 0, 10);

console.log('\nCandidate:');
debugEncoder.writeBits(0, 2); // host type
debugEncoder.writeIP('192.168.1.100');
debugEncoder.writePort(56789);

const encodedBytes = debugEncoder.getBytes();
console.log('\nFinal encoded bytes:', encodedBytes.length);
console.log('Hex:', Array.from(encodedBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Now decode with debug
console.log('\n\n=== Decoding with Debug ===\n');
const debugDecoder = new DebugDecoder(encodedBytes);

console.log('Type bit:');
const type = debugDecoder.readBits(1);

console.log('\nSetup:');
const setup = debugDecoder.readBits(2);

console.log('\nICE ufrag:');
const ufrag = debugDecoder.readVisibleString(8);

console.log('\nICE pwd:');
const pwd = debugDecoder.readVisibleString(24);

console.log('\nFingerprint:');
const fpBytesDecoded = debugDecoder.readOctetString();

console.log('\nNumber of candidates:');
const numCandidates = debugDecoder.readConstrainedInt(0, 10);

console.log('\nCandidate:');
const candType = debugDecoder.readBits(2);
const ip = debugDecoder.readIP();
const port = debugDecoder.readPort();

console.log('\n=== Decoded Values ===');
console.log('Type:', type === 0 ? 'o' : 'a');
console.log('Setup:', ['a', 'p', 'c'][setup]);
console.log('Ufrag:', ufrag);
console.log('Password:', pwd);
console.log('Fingerprint bytes:', fpBytesDecoded.length);
console.log('Candidates:', numCandidates);
console.log('Candidate:', `h,${ip}:${port}`);
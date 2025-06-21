// Test constrained integer encoding/decoding
import { UPEREncoder, UPERDecoder } from './asn1-uper-codec.js';

// Test encoding numbers 0-10
console.log('Testing constrained int encoding for range 0-10:');
console.log('Range needs', Math.ceil(Math.log2(11)), 'bits\n');

for (let i = 0; i <= 10; i++) {
    const encoder = new UPEREncoder();
    encoder.writeConstrainedInt(i, 0, 10);
    const bytes = encoder.getBytes();
    
    const decoder = new UPERDecoder(bytes);
    const decoded = decoder.readConstrainedInt(0, 10);
    
    const bits = [];
    for (let j = 0; j < 4; j++) {
        bits.push((bytes[0] >> (7 - j)) & 1);
    }
    
    console.log(`Value ${i}: encoded as ${bits.join('')}, decoded as ${decoded}, ${i === decoded ? 'OK' : 'FAIL'}`);
}
// Debug the encoding issue
import { encodeWebRTCData } from './asn1-uper-codec.js';

// Test data with 5 candidates (like the real data)
const testData = {
    t: 'o',
    u: 'PItY',
    p: 'LZtKtyp0EAk8fGx05HCmLzsv',
    f: '57:DA:B9:6C:99:65:85:F4:7F:95:A9:D0:BA:CD:77:E8:BB:61:93:00:93:1B:C5:61:97:50:7C:87:C5:02:8D:6E',
    s: 'a',
    c: [
        'h,169.254.199.180:58559',
        'h,172.27.80.1:58560', 
        'h,172.27.192.1:58561',
        'h,192.168.1.7:58562',
        's,24.17.60.171:58562,192.168.1.7:58562'
    ]
};

console.log('Test data candidates:', testData.c.length);

// Encode
const encoded = encodeWebRTCData(testData);
console.log('\nEncoded bytes:', encoded.length);
console.log('Hex:', Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Focus on the area around byte 62 where candidates count should be
console.log('\nBytes around position 62:');
for (let i = 60; i < 66; i++) {
    console.log(`Byte ${i}: 0x${encoded[i].toString(16).padStart(2, '0')} = ${encoded[i].toString(2).padStart(8, '0')}`);
}

// Manually check what 5 in 4 bits should be
console.log('\n5 in binary (4 bits): ' + (5).toString(2).padStart(4, '0'));
console.log('9 in binary (4 bits): ' + (9).toString(2).padStart(4, '0'));
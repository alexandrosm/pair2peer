// Debug the exact decoding issue
import { UPERDecoder } from './asn1-uper-codec.js';

// The hex data from the log
const hexStr = '08 a0 92 e8 b3 84 c5 a7 44 b7 47 97 03 04 54 16 b3 86 64 77 83 03 54 84 36 d4 c7 a7 37 62 05 7d ab 96 c9 96 58 5f 47 f9 5a 9d 0b ac d7 7e 8b b6 19 30 09 31 bc 56 19 75 07 c8 7c 50 28 d6 e9 2a 7f b1 ed 39 2f ca c1 b5 00 1e 4c 02 b0 6f 00 07 93 04 c0 a8 01 07 e4 c2 46 04 4f 2a f9 30 b0 2a 00 41 f9 30 8a 9f ec 7b 40 00 92 b0 6d 40 04 00 24 ac 1b c0 01 00 09 30 2a 00 41 c0 02 40';

// Convert to bytes
const bytes = new Uint8Array(hexStr.split(' ').map(h => parseInt(h, 16)));
console.log('Total bytes:', bytes.length);

// Manually trace through decoding
const decoder = new UPERDecoder(bytes);

// Type bit (1 bit)
const typeBit = decoder.readBits(1);
console.log('Type bit:', typeBit, '=> type:', typeBit === 0 ? 'offer' : 'answer');

// Setup (2 bits)
const setupBits = decoder.readBits(2);
console.log('Setup bits:', setupBits, '=> setup:', ['actpass', 'passive', 'active'][setupBits]);

// Ufrag (constrained string, max 8)
console.log('\nReading ufrag...');
const ufragLen = decoder.readConstrainedInt(0, 8);
console.log('Ufrag length:', ufragLen);
let ufrag = '';
for (let i = 0; i < ufragLen; i++) {
    ufrag += String.fromCharCode(decoder.readBits(8));
}
console.log('Ufrag:', ufrag);

// Password (constrained string, max 24)
console.log('\nReading password...');
const pwdLen = decoder.readConstrainedInt(0, 24);
console.log('Password length:', pwdLen);
let pwd = '';
for (let i = 0; i < pwdLen; i++) {
    pwd += String.fromCharCode(decoder.readBits(8));
}
console.log('Password:', pwd);

// Fingerprint (octet string with length determinant)
console.log('\nReading fingerprint...');
console.log('Bit position before fingerprint:', decoder.bitPos);
const fpLenBit = decoder.readBits(1);
console.log('Fingerprint length bit:', fpLenBit);
let fpLen;
if (fpLenBit === 0) {
    fpLen = decoder.readBits(7);
    console.log('Short form length:', fpLen);
} else {
    const fragBit = decoder.readBits(1);
    console.log('Fragmented bit:', fragBit);
    fpLen = decoder.readBits(14);
    console.log('Long form length:', fpLen);
}

const fpBytes = [];
for (let i = 0; i < fpLen; i++) {
    fpBytes.push(decoder.readBits(8));
}
console.log('Fingerprint bytes:', fpLen);
console.log('Bit position after fingerprint:', decoder.bitPos);

// Number of candidates
console.log('\nReading number of candidates...');
console.log('Bit position:', decoder.bitPos, 'Byte position:', Math.floor(decoder.bitPos / 8));
console.log('Next few bytes:', Array.from(bytes.slice(Math.floor(decoder.bitPos / 8), Math.floor(decoder.bitPos / 8) + 4)).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Read the 4 bits for candidate count (0-10 needs 4 bits)
const candidateCountBits = [];
for (let i = 0; i < 4; i++) {
    candidateCountBits.push(decoder.readBits(1));
}
console.log('Candidate count bits:', candidateCountBits.join(''));
const candidateCount = parseInt(candidateCountBits.join(''), 2);
console.log('Candidate count:', candidateCount);

// Show remaining bytes
console.log('\nRemaining bytes from current position:');
const currentBytePos = Math.floor(decoder.bitPos / 8);
console.log(Array.from(bytes.slice(currentBytePos, currentBytePos + 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
// ASN.1 UPER encoder/decoder for WebRTC signaling data
// This provides more efficient binary encoding than our simple binary codec

export class UPEREncoder {
    constructor() {
        this.bits = [];
    }

    writeBits(value, numBits) {
        for (let i = numBits - 1; i >= 0; i--) {
            this.bits.push((value >> i) & 1);
        }
    }

    writeConstrainedInt(value, min, max) {
        const range = max - min + 1;
        const bitsNeeded = Math.ceil(Math.log2(range));
        console.log(`writeConstrainedInt: value=${value}, min=${min}, max=${max}, range=${range}, bits=${bitsNeeded}`);
        this.writeBits(value - min, bitsNeeded);
    }

    writeLengthDeterminant(length) {
        if (length < 128) {
            this.writeBits(0, 1); // short form
            this.writeBits(length, 7);
        } else if (length < 16384) {
            // long form (up to 16K)
            this.writeBits(1, 1); // long form flag
            this.writeBits(0, 1); // not fragmented
            this.writeBits(length, 14); // 14 bits for length
        } else {
            throw new Error('Length too large');
        }
    }

    writeOctetString(bytes) {
        this.writeLengthDeterminant(bytes.length);
        for (const byte of bytes) {
            this.writeBits(byte, 8);
        }
    }

    writeVisibleString(str, maxLen) {
        // For known max length, we can use constrained encoding
        if (maxLen && str.length <= maxLen) {
            // Write length as constrained integer
            this.writeConstrainedInt(str.length, 0, maxLen);
        } else {
            this.writeLengthDeterminant(str.length);
        }
        
        for (let i = 0; i < str.length; i++) {
            this.writeBits(str.charCodeAt(i), 8); // Use 8 bits for full ASCII
        }
    }

    writeIP(ipStr) {
        const parts = ipStr.split('.');
        console.log(`Writing IP: ${ipStr}, parts: ${parts}`);
        for (const part of parts) {
            this.writeBits(parseInt(part), 8);
        }
    }

    writePort(port) {
        this.writeBits(port, 16);
    }

    getBytes() {
        const bytes = [];
        for (let i = 0; i < this.bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8 && i + j < this.bits.length; j++) {
                byte = (byte << 1) | (this.bits[i + j] || 0);
            }
            if (i + 8 > this.bits.length) {
                byte = byte << (8 - (this.bits.length % 8));
            }
            bytes.push(byte);
        }
        return new Uint8Array(bytes);
    }
}

export class UPERDecoder {
    constructor(bytes) {
        this.bytes = bytes;
        this.bitPos = 0;
    }

    readBits(numBits) {
        let value = 0;
        for (let i = 0; i < numBits; i++) {
            const byteIdx = Math.floor(this.bitPos / 8);
            const bitIdx = 7 - (this.bitPos % 8);
            if (byteIdx < this.bytes.length) {
                const bit = (this.bytes[byteIdx] >> bitIdx) & 1;
                value = (value << 1) | bit;
            }
            this.bitPos++;
        }
        return value;
    }

    readConstrainedInt(min, max) {
        const range = max - min + 1;
        const bitsNeeded = Math.ceil(Math.log2(range));
        const value = this.readBits(bitsNeeded) + min;
        console.log(`readConstrainedInt: min=${min}, max=${max}, range=${range}, bits=${bitsNeeded}, value=${value}`);
        return value;
    }

    readLengthDeterminant() {
        const isShort = this.readBits(1) === 0;
        if (isShort) {
            return this.readBits(7);
        } else {
            // long form
            const isFragmented = this.readBits(1) === 1;
            if (isFragmented) {
                throw new Error('Fragmented form not implemented');
            }
            return this.readBits(14); // 14 bits for length
        }
    }

    readOctetString() {
        const length = this.readLengthDeterminant();
        const bytes = [];
        for (let i = 0; i < length; i++) {
            bytes.push(this.readBits(8));
        }
        return new Uint8Array(bytes);
    }

    readVisibleString(maxLen) {
        let length;
        if (maxLen) {
            length = this.readConstrainedInt(0, maxLen);
        } else {
            length = this.readLengthDeterminant();
        }
        
        let str = '';
        for (let i = 0; i < length; i++) {
            str += String.fromCharCode(this.readBits(8)); // Match encoding
        }
        return str;
    }

    readIP() {
        const parts = [];
        for (let i = 0; i < 4; i++) {
            parts.push(this.readBits(8));
        }
        const ip = parts.join('.');
        console.log(`Read IP: ${ip}, parts: ${parts}`);
        return ip;
    }

    readPort() {
        return this.readBits(16);
    }
}

// Encode WebRTC data using ASN.1 UPER
export function encodeWebRTCData(data) {
    const encoder = new UPEREncoder();
    
    // Type bit (1 bit): 0=offer, 1=answer
    encoder.writeBits(data.t === 'o' ? 0 : 1, 1);
    
    // Setup (2 bits): 00=actpass, 01=passive, 10=active
    const setupMap = { 'a': 0, 'p': 1, 'c': 2 };
    encoder.writeBits(setupMap[data.s] || 0, 2);
    
    // ICE ufrag with length prefix
    const ufragLen = Math.min(data.u.length, 255);
    encoder.writeBits(ufragLen, 8);
    encoder.writeVisibleString(data.u.substring(0, ufragLen), ufragLen);
    
    // ICE pwd with length prefix
    const pwdLen = Math.min(data.p.length, 255);
    encoder.writeBits(pwdLen, 8);
    encoder.writeVisibleString(data.p.substring(0, pwdLen), pwdLen);
    
    // Fingerprint
    const fpHex = (data.f || '').replace(/:/g, '');
    const fpBytes = [];
    for (let i = 0; i < fpHex.length; i += 2) {
        fpBytes.push(parseInt(fpHex.substr(i, 2), 16));
    }
    encoder.writeOctetString(new Uint8Array(fpBytes));
    
    // Number of candidates (constrained to 0-20 for more flexibility)
    const candidates = data.c || [];
    console.log('ASN.1 encoder: Writing', candidates.length, 'candidates');
    console.log('ASN.1 encoder: Bit position before candidates count:', encoder.bits.length);
    encoder.writeConstrainedInt(candidates.length, 0, 20);
    console.log('ASN.1 encoder: Bit position after candidates count:', encoder.bits.length);
    
    // Encode each candidate
    candidates.forEach((cand, idx) => {
        console.log(`ASN.1 encoder: Candidate ${idx+1}: ${cand}`);
        const parts = cand.split(',');
        const type = parts[0];
        
        // Candidate type (2 bits): 00=host, 01=srflx, 10=relay
        const typeMap = { 'h': 0, 's': 1, 'r': 2 };
        encoder.writeBits(typeMap[type], 2);
        
        if (type === 'h') {
            const [ip, port] = parts[1].split(':');
            const networkId = parseInt(parts[2] || '1');
            encoder.writeIP(ip);
            encoder.writePort(parseInt(port));
            encoder.writeConstrainedInt(networkId, 1, 20); // network-id range expanded
        } else if (type === 's') {
            const [ip1, port1] = parts[1].split(':');
            const [ip2, port2] = parts[2].split(':');
            const networkId = parseInt(parts[3] || '1');
            encoder.writeIP(ip1);
            encoder.writePort(parseInt(port1));
            encoder.writeIP(ip2);
            encoder.writePort(parseInt(port2));
            encoder.writeConstrainedInt(networkId, 1, 20); // network-id range expanded
        } else if (type === 'r') {
            const [ip, port] = parts[1].split(':');
            encoder.writeIP(ip);
            encoder.writePort(parseInt(port));
            encoder.writeConstrainedInt(1, 1, 20); // default network-id 1 for relay
        }
    });
    
    return encoder.getBytes();
}

// Decode WebRTC data from ASN.1 UPER
export function decodeWebRTCData(bytes) {
    const decoder = new UPERDecoder(bytes);
    
    // Type bit
    const type = decoder.readBits(1) === 0 ? 'o' : 'a';
    
    // Setup
    const setupBits = decoder.readBits(2);
    const setupMap = ['a', 'p', 'c'];
    const setup = setupMap[setupBits];
    
    // ICE credentials with length prefix
    const ufragLen = decoder.readBits(8);
    const ufrag = decoder.readVisibleString(ufragLen);
    const pwdLen = decoder.readBits(8);
    const pwd = decoder.readVisibleString(pwdLen);
    
    // Fingerprint
    const fpBytes = decoder.readOctetString();
    let fingerprint = '';
    for (let i = 0; i < fpBytes.length; i++) {
        const hex = fpBytes[i].toString(16).padStart(2, '0').toUpperCase();
        fingerprint += hex;
        if (i < fpBytes.length - 1) fingerprint += ':';
    }
    
    // Candidates
    console.log('ASN.1 decoder: About to read number of candidates, bitPos:', decoder.bitPos);
    const numCandidates = decoder.readConstrainedInt(0, 20);
    console.log('ASN.1 decoder: Reading', numCandidates, 'candidates');
    const candidates = [];
    
    for (let i = 0; i < numCandidates; i++) {
        // Check if we have enough bits left
        const bitsLeft = (decoder.bytes.length * 8) - decoder.bitPos;
        console.log(`ASN.1 decoder: Candidate ${i+1} - bits left: ${bitsLeft}, bit pos: ${decoder.bitPos}`);
        
        if (bitsLeft < 2) {
            console.error('ASN.1 decoder: Not enough bits for candidate type!');
            break;
        }
        
        const typeBits = decoder.readBits(2);
        const typeMap = ['h', 's', 'r'];
        const type = typeMap[typeBits];
        console.log(`ASN.1 decoder: Candidate ${i+1} - type bits: ${typeBits}, type: ${type}`);
        
        if (!type) {
            console.error(`ASN.1 decoder: Invalid candidate type bits: ${typeBits}`);
            console.error(`Bit position: ${decoder.bitPos}, remaining bits: ${bitsLeft}`);
            // Skip this candidate and try to recover
            break;
        }
        
        if (type === 'h') {
            const ip = decoder.readIP();
            const port = decoder.readPort();
            const networkId = decoder.readConstrainedInt(1, 20);
            candidates.push(`h,${ip}:${port},${networkId}`);
        } else if (type === 's') {
            const ip1 = decoder.readIP();
            const port1 = decoder.readPort();
            const ip2 = decoder.readIP();
            const port2 = decoder.readPort();
            const networkId = decoder.readConstrainedInt(1, 20);
            candidates.push(`s,${ip1}:${port1},${ip2}:${port2},${networkId}`);
        } else if (type === 'r') {
            const ip = decoder.readIP();
            const port = decoder.readPort();
            const networkId = decoder.readConstrainedInt(1, 20);
            candidates.push(`r,${ip}:${port}`);
        }
    }
    
    return {
        t: type,
        u: ufrag,
        p: pwd,
        f: fingerprint,
        s: setup,
        c: candidates
    };
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.encodeWebRTCData = encodeWebRTCData;
    window.decodeWebRTCData = decodeWebRTCData;
}
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
        this.writeBits(value - min, bitsNeeded);
    }

    writeLengthDeterminant(length) {
        if (length < 128) {
            this.writeBits(0, 1); // short form
            this.writeBits(length, 7);
        } else {
            throw new Error('Length too large for short form');
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
            this.writeBits(str.charCodeAt(i), 7); // Visible string uses 7 bits
        }
    }

    writeIP(ipStr) {
        const parts = ipStr.split('.');
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
        return this.readBits(bitsNeeded) + min;
    }

    readLengthDeterminant() {
        const isShort = this.readBits(1) === 0;
        if (isShort) {
            return this.readBits(7);
        }
        throw new Error('Long form not implemented');
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
            str += String.fromCharCode(this.readBits(7));
        }
        return str;
    }

    readIP() {
        const parts = [];
        for (let i = 0; i < 4; i++) {
            parts.push(this.readBits(8));
        }
        return parts.join('.');
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
    
    // ICE ufrag (constrained to 4-8 chars typically)
    encoder.writeVisibleString(data.u, 8);
    
    // ICE pwd (constrained to 22-24 chars typically)
    encoder.writeVisibleString(data.p, 24);
    
    // Fingerprint
    const fpHex = (data.f || '').replace(/:/g, '');
    const fpBytes = [];
    for (let i = 0; i < fpHex.length; i += 2) {
        fpBytes.push(parseInt(fpHex.substr(i, 2), 16));
    }
    encoder.writeOctetString(new Uint8Array(fpBytes));
    
    // Number of candidates (constrained to 0-10)
    const candidates = data.c || [];
    encoder.writeConstrainedInt(candidates.length, 0, 10);
    
    // Encode each candidate
    candidates.forEach(cand => {
        const parts = cand.split(',');
        const type = parts[0];
        
        // Candidate type (2 bits): 00=host, 01=srflx, 10=relay
        const typeMap = { 'h': 0, 's': 1, 'r': 2 };
        encoder.writeBits(typeMap[type], 2);
        
        if (type === 'h' || type === 'r') {
            const [ip, port] = parts[1].split(':');
            encoder.writeIP(ip);
            encoder.writePort(parseInt(port));
        } else if (type === 's') {
            const [ip1, port1] = parts[1].split(':');
            const [ip2, port2] = parts[2].split(':');
            encoder.writeIP(ip1);
            encoder.writePort(parseInt(port1));
            encoder.writeIP(ip2);
            encoder.writePort(parseInt(port2));
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
    
    // ICE credentials
    const ufrag = decoder.readVisibleString(8);
    const pwd = decoder.readVisibleString(24);
    
    // Fingerprint
    const fpBytes = decoder.readOctetString();
    let fingerprint = '';
    for (let i = 0; i < fpBytes.length; i++) {
        const hex = fpBytes[i].toString(16).padStart(2, '0').toUpperCase();
        fingerprint += hex;
        if (i < fpBytes.length - 1) fingerprint += ':';
    }
    
    // Candidates
    const numCandidates = decoder.readConstrainedInt(0, 10);
    const candidates = [];
    
    for (let i = 0; i < numCandidates; i++) {
        const typeBits = decoder.readBits(2);
        const typeMap = ['h', 's', 'r'];
        const type = typeMap[typeBits];
        
        if (type === 'h' || type === 'r') {
            const ip = decoder.readIP();
            const port = decoder.readPort();
            candidates.push(`${type},${ip}:${port}`);
        } else if (type === 's') {
            const ip1 = decoder.readIP();
            const port1 = decoder.readPort();
            const ip2 = decoder.readIP();
            const port2 = decoder.readPort();
            candidates.push(`s,${ip1}:${port1},${ip2}:${port2}`);
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
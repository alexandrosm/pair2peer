// Test ASN.1 UPER approach with dictionary and IFP optimizations
const crypto = require('crypto');

// ASN.1 UPER-like encoding with optimizations
class OptimizedEncoder {
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
            this.writeBits(0, 1);
            this.writeBits(length, 7);
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

    writeVisibleString(str) {
        this.writeLengthDeterminant(str.length);
        for (let i = 0; i < str.length; i++) {
            this.writeBits(str.charCodeAt(i), 8);
        }
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

// Test data
const testData = {
    ufrag: '4aFz',
    pwd: 'by4GZGG1lw+040DWA6hXM5Bz',
    fingerprint: crypto.randomBytes(32), // SHA-256
    candidates: [
        { type: 'host', ip: '192.168.1.100', port: 56789 },
        { type: 'srflx', ip: '192.168.1.100', port: 56789, raddr: '203.0.113.1', rport: 3478 },
        { type: 'relay', ip: '198.51.100.1', port: 3478 }
    ]
};

// Method 1: ASN.1 UPER with dictionaries and IFP
function encodeASN1WithOptimizations(data) {
    const encoder = new OptimizedEncoder();
    
    // Build dictionaries
    const ipSet = new Set();
    const portSet = new Set();
    
    data.candidates.forEach(c => {
        ipSet.add(c.ip);
        if (c.raddr) ipSet.add(c.raddr);
        portSet.add(c.port);
        if (c.rport) portSet.add(c.rport);
    });
    
    const ipDict = new Map([...ipSet].map((ip, idx) => [ip, idx]));
    const portDict = new Map([...portSet].map((port, idx) => [port, idx]));
    
    // Flags byte (simplified)
    const flags = 0x06; // Dictionary + IFP enabled
    encoder.writeBits(flags, 8);
    
    // Core data
    encoder.writeVisibleString(data.ufrag);
    encoder.writeVisibleString(data.pwd);
    encoder.writeOctetString(data.fingerprint);
    
    // IP dictionary
    encoder.writeLengthDeterminant(ipDict.size);
    for (const [ip] of ipDict) {
        const parts = ip.split('.').map(Number);
        parts.forEach(octet => encoder.writeBits(octet, 8));
    }
    
    // Port dictionary  
    encoder.writeLengthDeterminant(portDict.size);
    for (const [port] of portDict) {
        encoder.writeBits(port, 16);
    }
    
    // Candidates with IFP
    const ipIndexBits = Math.ceil(Math.log2(ipDict.size));
    const portIndexBits = Math.ceil(Math.log2(portDict.size));
    
    encoder.writeLengthDeterminant(data.candidates.length);
    
    let prevCandidate = null;
    data.candidates.forEach((cand, idx) => {
        if (idx === 0) {
            // First candidate - full encoding
            encoder.writeConstrainedInt(cand.type === 'host' ? 0 : cand.type === 'srflx' ? 1 : 2, 0, 2);
            encoder.writeBits(ipDict.get(cand.ip), ipIndexBits);
            encoder.writeBits(portDict.get(cand.port), portIndexBits);
            
            const hasRaddr = !!cand.raddr;
            encoder.writeBits(hasRaddr ? 1 : 0, 1);
            if (hasRaddr) {
                encoder.writeBits(ipDict.get(cand.raddr), ipIndexBits);
                encoder.writeBits(portDict.get(cand.rport), portIndexBits);
            }
        } else {
            // Delta encoding
            const ipChanged = cand.ip !== prevCandidate.ip;
            const portChanged = cand.port !== prevCandidate.port;
            const typeChanged = cand.type !== prevCandidate.type;
            
            encoder.writeBits(ipChanged ? 1 : 0, 1);
            encoder.writeBits(portChanged ? 1 : 0, 1);
            encoder.writeBits(typeChanged ? 1 : 0, 1);
            
            if (ipChanged) encoder.writeBits(ipDict.get(cand.ip), ipIndexBits);
            if (portChanged) encoder.writeBits(portDict.get(cand.port), portIndexBits);
            if (typeChanged) encoder.writeConstrainedInt(cand.type === 'host' ? 0 : cand.type === 'srflx' ? 1 : 2, 0, 2);
            
            const hasRaddr = !!cand.raddr;
            encoder.writeBits(hasRaddr ? 1 : 0, 1);
            if (hasRaddr) {
                const raddrChanged = !prevCandidate.raddr || cand.raddr !== prevCandidate.raddr;
                const rportChanged = !prevCandidate.rport || cand.rport !== prevCandidate.rport;
                
                encoder.writeBits(raddrChanged ? 1 : 0, 1);
                encoder.writeBits(rportChanged ? 1 : 0, 1);
                
                if (raddrChanged) encoder.writeBits(ipDict.get(cand.raddr), ipIndexBits);
                if (rportChanged) encoder.writeBits(portDict.get(cand.rport), portIndexBits);
            }
        }
        prevCandidate = cand;
    });
    
    return encoder.getBytes();
}

// Method 2: IP/Port folding
function encodeWithIPPortFolding(data) {
    const buffer = [];
    
    // Type byte
    buffer.push(0x01);
    
    // Ufrag (4 bytes fixed)
    for (let i = 0; i < 4; i++) {
        buffer.push(i < data.ufrag.length ? data.ufrag.charCodeAt(i) : 0);
    }
    
    // Password (24 bytes fixed)
    for (let i = 0; i < 24; i++) {
        buffer.push(i < data.pwd.length ? data.pwd.charCodeAt(i) : 0);
    }
    
    // Fingerprint
    buffer.push(...data.fingerprint);
    
    // Candidates with IP/port folding
    buffer.push(data.candidates.length);
    
    data.candidates.forEach(cand => {
        const type = cand.type === 'host' ? 0x01 : cand.type === 'srflx' ? 0x02 : 0x03;
        buffer.push(type);
        
        // Fold IP and port into 48-bit value
        const ipParts = cand.ip.split('.').map(Number);
        const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
        
        // Write as 6 bytes (48 bits)
        buffer.push((ipNum >> 24) & 0xFF);
        buffer.push((ipNum >> 16) & 0xFF);
        buffer.push((ipNum >> 8) & 0xFF);
        buffer.push(ipNum & 0xFF);
        buffer.push((cand.port >> 8) & 0xFF);
        buffer.push(cand.port & 0xFF);
        
        if (cand.raddr) {
            const raddrParts = cand.raddr.split('.').map(Number);
            const raddrNum = (raddrParts[0] << 24) | (raddrParts[1] << 16) | (raddrParts[2] << 8) | raddrParts[3];
            
            buffer.push((raddrNum >> 24) & 0xFF);
            buffer.push((raddrNum >> 16) & 0xFF);
            buffer.push((raddrNum >> 8) & 0xFF);
            buffer.push(raddrNum & 0xFF);
            buffer.push((cand.rport >> 8) & 0xFF);
            buffer.push(cand.rport & 0xFF);
        }
    });
    
    return new Uint8Array(buffer);
}

// Method 3: Drop DTLS setup & infer hash
function encodeMinimal(data) {
    const buffer = [];
    
    // Type byte (no setup bit needed)
    buffer.push(0x00);
    
    // Core fields
    for (let i = 0; i < 4; i++) {
        buffer.push(i < data.ufrag.length ? data.ufrag.charCodeAt(i) : 0);
    }
    
    for (let i = 0; i < 24; i++) {
        buffer.push(i < data.pwd.length ? data.pwd.charCodeAt(i) : 0);
    }
    
    // Fingerprint only (hash type inferred from length)
    buffer.push(...data.fingerprint);
    
    // Minimal candidates
    buffer.push(data.candidates.length);
    
    data.candidates.forEach(cand => {
        const type = cand.type === 'host' ? 0x01 : cand.type === 'srflx' ? 0x02 : 0x03;
        buffer.push(type);
        
        const ipParts = cand.ip.split('.').map(Number);
        ipParts.forEach(octet => buffer.push(octet));
        buffer.push((cand.port >> 8) & 0xFF);
        buffer.push(cand.port & 0xFF);
        
        if (cand.raddr) {
            const raddrParts = cand.raddr.split('.').map(Number);
            raddrParts.forEach(octet => buffer.push(octet));
            buffer.push((cand.rport >> 8) & 0xFF);
            buffer.push(cand.rport & 0xFF);
        }
    });
    
    return new Uint8Array(buffer);
}

// Run tests
console.log('=== OPTIMIZATION COMPARISON ===\n');

const asn1Encoded = encodeASN1WithOptimizations(testData);
console.log(`ASN.1 UPER with Dict+IFP: ${asn1Encoded.length} bytes`);

const foldedEncoded = encodeWithIPPortFolding(testData);
console.log(`IP/Port folding: ${foldedEncoded.length} bytes`);

const minimalEncoded = encodeMinimal(testData);
console.log(`Minimal (no setup, infer hash): ${minimalEncoded.length} bytes`);

console.log(`\nCurrent binary format: 89 bytes`);

// Base45 comparison
const base45Overhead = 1.3;
console.log('\n=== QR BITS COMPARISON ===');
console.log(`ASN.1 → Base45: ${Math.ceil(asn1Encoded.length * base45Overhead)} chars → ${Math.ceil(asn1Encoded.length * base45Overhead * 5.5)} bits`);
console.log(`Folded → Base45: ${Math.ceil(foldedEncoded.length * base45Overhead)} chars → ${Math.ceil(foldedEncoded.length * base45Overhead * 5.5)} bits`);
console.log(`Minimal → Base45: ${Math.ceil(minimalEncoded.length * base45Overhead)} chars → ${Math.ceil(minimalEncoded.length * base45Overhead * 5.5)} bits`);
console.log(`Current → Base45: ${Math.ceil(89 * base45Overhead)} chars → ${Math.ceil(89 * base45Overhead * 5.5)} bits`);

// Detailed breakdown
console.log('\n=== DETAILED SAVINGS ===');
console.log('IP/Port folding saves: No extra bytes (already using 6 bytes)');
console.log('Dropping DTLS setup saves: 1 bit (already dropped)');
console.log('Inferring hash type saves: ~10 bytes (sha-256 string)');
console.log('ASN.1 dict overhead: ~20-30 bytes for small dictionaries');
console.log('IFP delta encoding saves: ~3-5 bytes per similar candidate');
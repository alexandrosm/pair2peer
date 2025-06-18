// Base45 implementation for QR code optimization
// Based on the specification used in EU Digital COVID Certificate

const BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

function base45Encode(buffer) {
    const bytes = new Uint8Array(buffer);
    let result = '';
    
    for (let i = 0; i < bytes.length; i += 2) {
        if (i + 1 < bytes.length) {
            // Process 2 bytes -> 3 chars
            const x = (bytes[i] << 8) | bytes[i + 1];
            const e = x % 45;
            const d = Math.floor(x / 45) % 45;
            const c = Math.floor(x / (45 * 45));
            result += BASE45_CHARSET[c] + BASE45_CHARSET[d] + BASE45_CHARSET[e];
        } else {
            // Process 1 byte -> 2 chars
            const x = bytes[i];
            const d = Math.floor(x / 45);
            const e = x % 45;
            result += BASE45_CHARSET[d] + BASE45_CHARSET[e];
        }
    }
    
    return result;
}

function base45Decode(str) {
    const result = [];
    
    for (let i = 0; i < str.length; i += 3) {
        if (i + 2 < str.length) {
            // Process 3 chars -> 2 bytes
            const c = BASE45_CHARSET.indexOf(str[i]);
            const d = BASE45_CHARSET.indexOf(str[i + 1]);
            const e = BASE45_CHARSET.indexOf(str[i + 2]);
            
            if (c === -1 || d === -1 || e === -1) {
                throw new Error('Invalid Base45 character');
            }
            
            const x = c * 45 * 45 + d * 45 + e;
            result.push((x >> 8) & 0xFF);
            result.push(x & 0xFF);
        } else if (i + 1 < str.length) {
            // Process 2 chars -> 1 byte
            const d = BASE45_CHARSET.indexOf(str[i]);
            const e = BASE45_CHARSET.indexOf(str[i + 1]);
            
            if (d === -1 || e === -1) {
                throw new Error('Invalid Base45 character');
            }
            
            const x = d * 45 + e;
            result.push(x);
        }
    }
    
    return new Uint8Array(result);
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.base45Encode = base45Encode;
    window.base45Decode = base45Decode;
}
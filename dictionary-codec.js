// Dictionary-based codec for WebRTC signaling
// Both peers must have the same dictionary

// Precomputed dictionary of common patterns
export const DICTIONARY = {
    // Common IP prefixes (save 2-3 bytes each)
    IPS: {
        0xF0: [192, 168, 1],    // 192.168.1.x
        0xF1: [192, 168, 0],    // 192.168.0.x
        0xF2: [10, 0, 0],       // 10.0.0.x
        0xF3: [172, 16, 0],     // 172.16.0.x
        0xF4: [172, 31, 0],     // 172.31.0.x (AWS)
        0xF5: [10, 0, 1],       // 10.0.1.x
    },
    
    // Common ports (save 1 byte each)
    PORTS: {
        0xE0: 443,
        0xE1: 3478,   // STUN
        0xE2: 5349,   // STUNS
        0xE3: 19302,  // Google STUN
        0xE4: 8080,
        0xE5: 1080,
    },
    
    // Fingerprint patterns (save multiple bytes)
    FINGERPRINT_PATTERNS: [
        { pattern: [0x00, 0x00, 0x00, 0x00], code: 0xD0 },
        { pattern: [0xFF, 0xFF, 0xFF, 0xFF], code: 0xD1 },
        { pattern: [0x00, 0x00], code: 0xD2 },
        { pattern: [0xFF, 0xFF], code: 0xD3 },
        { pattern: [0x01, 0x23, 0x45, 0x67], code: 0xD4 },
        { pattern: [0x89, 0xAB, 0xCD, 0xEF], code: 0xD5 },
    ]
};

export function encodeDictionary(data) {
    const buffer = [];
    
    // 1 byte: type (high bit) + setup (low 2 bits) 
    const typeBit = data.t === 'o' ? 0x80 : 0x00;
    const setupBits = data.s === 'a' ? 0x01 : data.s === 'p' ? 0x02 : 0x03;
    buffer.push(typeBit | setupBits);
    
    // 4 bytes: ufrag
    const ufrag = data.u || '';
    for (let i = 0; i < 4; i++) {
        buffer.push(i < ufrag.length ? ufrag.charCodeAt(i) : 0);
    }
    
    // 24 bytes: pwd (consider compression later)
    const pwd = data.p || '';
    for (let i = 0; i < 24; i++) {
        buffer.push(i < pwd.length ? pwd.charCodeAt(i) : 0);
    }
    
    // Fingerprint with pattern matching
    const fpHex = (data.f || '').replace(/:/g, '');
    const fpBytes = [];
    for (let i = 0; i < fpHex.length; i += 2) {
        fpBytes.push(parseInt(fpHex.substr(i, 2), 16));
    }
    
    // Try to find patterns in fingerprint
    let fpIndex = 0;
    while (fpIndex < fpBytes.length) {
        let matched = false;
        
        // Try each pattern
        for (const {pattern, code} of DICTIONARY.FINGERPRINT_PATTERNS) {
            if (fpIndex + pattern.length <= fpBytes.length) {
                let match = true;
                for (let j = 0; j < pattern.length; j++) {
                    if (fpBytes[fpIndex + j] !== pattern[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    buffer.push(code);
                    fpIndex += pattern.length;
                    matched = true;
                    break;
                }
            }
        }
        
        if (!matched) {
            buffer.push(fpBytes[fpIndex++]);
        }
    }
    
    // Pad fingerprint section to consistent length (48 bytes total)
    // We've written: 1 (type) + 4 (ufrag) + 24 (pwd) = 29 bytes so far
    // Fingerprint section should be exactly 48 bytes
    while (buffer.length < 77) { // 29 + 48 = 77
        buffer.push(0);
    }
    
    // Candidate count
    const candidates = data.c || [];
    buffer.push(candidates.length);
    
    // Encode candidates with dictionary
    candidates.forEach(cand => {
        const parts = cand.split(',');
        const type = parts[0];
        
        // 1 byte: candidate type
        buffer.push(type === 'h' ? 0x01 : type === 's' ? 0x02 : 0x03);
        
        if (type === 'h' || type === 'r') {
            const [ip, port] = parts[1].split(':');
            const ipParts = ip.split('.').map(Number);
            
            // Check for dictionary IP
            let encoded = false;
            for (const [code, prefix] of Object.entries(DICTIONARY.IPS)) {
                if (ipParts[0] === prefix[0] && ipParts[1] === prefix[1] && ipParts[2] === prefix[2]) {
                    buffer.push(parseInt(code));
                    buffer.push(ipParts[3]);
                    encoded = true;
                    break;
                }
            }
            
            if (!encoded) {
                buffer.push(0); // Not in dictionary
                ipParts.forEach(octet => buffer.push(octet));
            }
            
            // Encode port
            const portNum = parseInt(port);
            const portCode = Object.entries(DICTIONARY.PORTS).find(([_, p]) => p === portNum)?.[0];
            
            if (portCode) {
                buffer.push(parseInt(portCode));
            } else {
                buffer.push(0); // Not in dictionary
                buffer.push((portNum >> 8) & 0xFF);
                buffer.push(portNum & 0xFF);
            }
        } else if (type === 's') {
            // srflx has server IP/port and reflexive IP/port
            const serverAddr = parts[1];
            const reflexAddr = parts[2];
            
            // Encode server address
            const [serverIp, serverPort] = serverAddr.split(':');
            const serverIpParts = serverIp.split('.').map(Number);
            
            // Encode server IP
            let encoded = false;
            for (const [code, prefix] of Object.entries(DICTIONARY.IPS)) {
                if (serverIpParts[0] === prefix[0] && serverIpParts[1] === prefix[1] && serverIpParts[2] === prefix[2]) {
                    buffer.push(parseInt(code));
                    buffer.push(serverIpParts[3]);
                    encoded = true;
                    break;
                }
            }
            
            if (!encoded) {
                buffer.push(0); // Not in dictionary
                serverIpParts.forEach(octet => buffer.push(octet));
            }
            
            // Encode server port
            const serverPortNum = parseInt(serverPort);
            const serverPortCode = Object.entries(DICTIONARY.PORTS).find(([_, p]) => p === serverPortNum)?.[0];
            
            if (serverPortCode) {
                buffer.push(parseInt(serverPortCode));
            } else {
                buffer.push(0); // Not in dictionary
                buffer.push((serverPortNum >> 8) & 0xFF);
                buffer.push(serverPortNum & 0xFF);
            }
            
            // Encode reflexive address
            const [reflexIp, reflexPort] = reflexAddr.split(':');
            const reflexIpParts = reflexIp.split('.').map(Number);
            
            // Encode reflex IP
            encoded = false;
            for (const [code, prefix] of Object.entries(DICTIONARY.IPS)) {
                if (reflexIpParts[0] === prefix[0] && reflexIpParts[1] === prefix[1] && reflexIpParts[2] === prefix[2]) {
                    buffer.push(parseInt(code));
                    buffer.push(reflexIpParts[3]);
                    encoded = true;
                    break;
                }
            }
            
            if (!encoded) {
                buffer.push(0); // Not in dictionary
                reflexIpParts.forEach(octet => buffer.push(octet));
            }
            
            // Encode reflex port
            const reflexPortNum = parseInt(reflexPort);
            const reflexPortCode = Object.entries(DICTIONARY.PORTS).find(([_, p]) => p === reflexPortNum)?.[0];
            
            if (reflexPortCode) {
                buffer.push(parseInt(reflexPortCode));
            } else {
                buffer.push(0); // Not in dictionary
                buffer.push((reflexPortNum >> 8) & 0xFF);
                buffer.push(reflexPortNum & 0xFF);
            }
        }
    });
    
    return new Uint8Array(buffer);
}

export function decodeDictionary(bytes) {
    let offset = 0;
    
    // Type and setup
    const typeByte = bytes[offset++];
    const type = (typeByte & 0x80) ? 'o' : 'a';
    const setup = (typeByte & 0x03) === 0x01 ? 'a' : 
                  (typeByte & 0x03) === 0x02 ? 'p' : 'c';
    
    // Ufrag
    let ufrag = '';
    for (let i = 0; i < 4; i++) {
        if (bytes[offset] !== 0) {
            ufrag += String.fromCharCode(bytes[offset]);
        }
        offset++;
    }
    
    // Password
    let pwd = '';
    for (let i = 0; i < 24; i++) {
        if (bytes[offset] !== 0) {
            pwd += String.fromCharCode(bytes[offset]);
        }
        offset++;
    }
    
    // Fingerprint (decode patterns) - exactly 48 bytes
    const fpBytes = [];
    const fpEnd = offset + 48;
    while (offset < fpEnd) {
        const byte = bytes[offset++];
        
        // Check if it's a pattern code
        const pattern = DICTIONARY.FINGERPRINT_PATTERNS.find(p => p.code === byte);
        if (pattern && fpBytes.length + pattern.pattern.length <= 48) {
            fpBytes.push(...pattern.pattern);
        } else if (byte !== 0) {
            fpBytes.push(byte);
        }
    }
    
    // Ensure we're at the right position
    offset = 77; // 1 + 4 + 24 + 48
    
    // Build fingerprint string
    let fingerprint = '';
    for (let i = 0; i < fpBytes.length && i < 48; i++) {
        fingerprint += fpBytes[i].toString(16).padStart(2, '0').toUpperCase();
        if (i < 47) fingerprint += ':';
    }
    
    // Candidates
    const candidateCount = bytes[offset++];
    const candidates = [];
    
    for (let i = 0; i < candidateCount && offset < bytes.length; i++) {
        const candType = bytes[offset++];
        
        if (candType === 0x01 || candType === 0x03) {
            // Host or Relay
            const ipCode = bytes[offset++];
            let ip;
            
            if (ipCode === 0) {
                // Full IP
                ip = `${bytes[offset++]}.${bytes[offset++]}.${bytes[offset++]}.${bytes[offset++]}`;
            } else {
                // Dictionary IP
                const prefix = DICTIONARY.IPS[ipCode];
                if (!prefix) {
                    throw new Error(`Unknown IP dictionary code: 0x${ipCode.toString(16)}`);
                }
                const lastOctet = bytes[offset++];
                ip = `${prefix[0]}.${prefix[1]}.${prefix[2]}.${lastOctet}`;
            }
            
            // Port
            const portCode = bytes[offset++];
            let port;
            
            if (portCode === 0) {
                // Full port
                port = (bytes[offset++] << 8) | bytes[offset++];
            } else {
                // Dictionary port
                port = DICTIONARY.PORTS[portCode];
                if (!port) {
                    throw new Error(`Unknown port dictionary code: 0x${portCode.toString(16)}`);
                }
            }
            
            candidates.push(`${candType === 0x01 ? 'h' : 'r'},${ip}:${port}`);
        } else if (candType === 0x02) {
            // srflx - has server and reflexive address
            // Server IP
            const serverIpCode = bytes[offset++];
            let serverIp;
            
            if (serverIpCode === 0) {
                // Full IP
                serverIp = `${bytes[offset++]}.${bytes[offset++]}.${bytes[offset++]}.${bytes[offset++]}`;
            } else {
                // Dictionary IP
                const prefix = DICTIONARY.IPS[serverIpCode];
                if (!prefix) {
                    throw new Error(`Unknown IP dictionary code: 0x${serverIpCode.toString(16)}`);
                }
                const lastOctet = bytes[offset++];
                serverIp = `${prefix[0]}.${prefix[1]}.${prefix[2]}.${lastOctet}`;
            }
            
            // Server Port
            const serverPortCode = bytes[offset++];
            let serverPort;
            
            if (serverPortCode === 0) {
                // Full port
                serverPort = (bytes[offset++] << 8) | bytes[offset++];
            } else {
                // Dictionary port
                serverPort = DICTIONARY.PORTS[serverPortCode];
                if (!serverPort) {
                    throw new Error(`Unknown port dictionary code: 0x${serverPortCode.toString(16)}`);
                }
            }
            
            // Reflexive IP
            const reflexIpCode = bytes[offset++];
            let reflexIp;
            
            if (reflexIpCode === 0) {
                // Full IP
                reflexIp = `${bytes[offset++]}.${bytes[offset++]}.${bytes[offset++]}.${bytes[offset++]}`;
            } else {
                // Dictionary IP
                const prefix = DICTIONARY.IPS[reflexIpCode];
                if (!prefix) {
                    throw new Error(`Unknown IP dictionary code: 0x${reflexIpCode.toString(16)}`);
                }
                const lastOctet = bytes[offset++];
                reflexIp = `${prefix[0]}.${prefix[1]}.${prefix[2]}.${lastOctet}`;
            }
            
            // Reflexive Port
            const reflexPortCode = bytes[offset++];
            let reflexPort;
            
            if (reflexPortCode === 0) {
                // Full port
                reflexPort = (bytes[offset++] << 8) | bytes[offset++];
            } else {
                // Dictionary port
                reflexPort = DICTIONARY.PORTS[reflexPortCode];
                if (!reflexPort) {
                    throw new Error(`Unknown port dictionary code: 0x${reflexPortCode.toString(16)}`);
                }
            }
            
            candidates.push(`s,${serverIp}:${serverPort},${reflexIp}:${reflexPort}`);
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

// Calculate actual savings
export function calculateSavings(data) {
    const original = 89; // Our current binary format
    const withDict = encodeDictionary(data).length;
    
    return {
        original,
        withDict,
        saved: original - withDict,
        percentage: Math.round((original - withDict) / original * 100)
    };
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.encodeDictionary = encodeDictionary;
    window.decodeDictionary = decodeDictionary;
    window.DICTIONARY = DICTIONARY;
}
// WebRTC compression module - works in both Node.js and browser
// This module handles the complete compression pipeline for WebRTC signaling

// Import dependencies based on environment
const isNode = typeof window === 'undefined';

// In Node.js, we need to provide browser-compatible APIs
if (isNode) {
    global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
    global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

// Import the compression modules
async function loadModules() {
    if (isNode) {
        const { compactSDP, expandSDP } = await import('./sdp-compact.js');
        const { encodeWebRTCData, decodeWebRTCData } = await import('./asn1-uper-codec.js');
        return { compactSDP, expandSDP, encodeWebRTCData, decodeWebRTCData };
    } else {
        // In browser, these should be already loaded
        return {
            compactSDP: window.compactSDP,
            expandSDP: window.expandSDP,
            encodeWebRTCData: window.encodeWebRTCData,
            decodeWebRTCData: window.decodeWebRTCData
        };
    }
}

// Main compression function
export async function compressOffer(sdp) {
    const { compactSDP, encodeWebRTCData } = await loadModules();
    
    // Create offer data structure
    const offerData = {
        t: 'o', // type: offer
        ...compactSDP(sdp)
    };
    
    // Encode to binary using ASN.1 UPER
    const binary = encodeWebRTCData(offerData);
    console.log('ASN.1 UPER encoded to', binary.length, 'bytes');
    
    // Convert to base64 for QR code
    let binaryStr = '';
    for (let i = 0; i < binary.length; i++) {
        binaryStr += String.fromCharCode(binary[i]);
    }
    
    const base64 = btoa(binaryStr);
    console.log('Base64 encoded to', base64.length, 'characters');
    
    return {
        compressed: base64,
        offerData: offerData,
        binarySize: binary.length,
        base64Size: base64.length
    };
}

// Main decompression function
export async function decompressOffer(base64) {
    const { expandSDP, decodeWebRTCData } = await loadModules();
    
    try {
        // Decode from base64
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        
        console.log('Decoded to', bytes.length, 'bytes');
        
        // Decode ASN.1 UPER format
        const decoded = decodeWebRTCData(bytes);
        console.log('ASN.1 UPER decoded:', decoded);
        
        if (!decoded || decoded.t !== 'o') {
            throw new Error(`Invalid offer type: expected 'o', got '${decoded?.t}'`);
        }
        
        // Expand SDP
        const expandedSDP = expandSDP(decoded, 'offer');
        
        return {
            sdp: expandedSDP,
            offerData: decoded
        };
    } catch (error) {
        console.error('Decompression error:', error);
        throw error;
    }
}

// Answer compression
export async function compressAnswer(sdp) {
    const { compactSDP, encodeWebRTCData } = await loadModules();
    
    const answerData = {
        t: 'a', // type: answer
        ...compactSDP(sdp)
    };
    
    const binary = encodeWebRTCData(answerData);
    let binaryStr = '';
    for (let i = 0; i < binary.length; i++) {
        binaryStr += String.fromCharCode(binary[i]);
    }
    
    const base64 = btoa(binaryStr);
    
    return {
        compressed: base64,
        answerData: answerData,
        binarySize: binary.length,
        base64Size: base64.length
    };
}

// Answer decompression
export async function decompressAnswer(base64) {
    const { expandSDP, decodeWebRTCData } = await loadModules();
    
    try {
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        
        const decoded = decodeWebRTCData(bytes);
        
        if (!decoded || decoded.t !== 'a') {
            throw new Error(`Invalid answer type: expected 'a', got '${decoded?.t}'`);
        }
        
        const expandedSDP = expandSDP(decoded, 'answer');
        
        return {
            sdp: expandedSDP,
            answerData: decoded
        };
    } catch (error) {
        console.error('Decompression error:', error);
        throw error;
    }
}

// Self-test function
export async function runSelfTest() {
    console.log('=== WebRTC Compress Self Test ===\n');
    
    try {
        // Test with a sample SDP
        const testSDP = `v=0
o=- 4611731400430051336 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=extmap-allow-mixed
a=msid-semantic:WMS
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:4Xg7
a=ice-pwd:by4GZGG1lw+040DWA6hXM5Bz
a=ice-options:trickle
a=fingerprint:sha-256 5B:D3:8E:66:0E:7D:D3:F3:8E:E6:80:28:19:FC:55:AD:58:5D:B9:3D:A8:DE:45:4A:E7:87:B0:6A:D9:AE:76:FC
a=setup:actpass
a=mid:0
a=sctp-port:5000
a=candidate:2189604649 1 udp 2122260223 192.168.1.106 56688 typ host generation 0 network-id 4 network-cost 10
a=candidate:3480112345 1 udp 1686052607 73.162.94.27 56688 typ srflx raddr 192.168.1.106 rport 56688 generation 0 network-id 4 network-cost 10`;

        console.log('1. Testing offer compression...');
        const compressed = await compressOffer(testSDP);
        console.log(`   Original: ${testSDP.length} chars`);
        console.log(`   Binary: ${compressed.binarySize} bytes`);
        console.log(`   Base64: ${compressed.base64Size} chars`);
        console.log(`   Compression: ${(100 - (compressed.base64Size / testSDP.length * 100)).toFixed(1)}%`);
        console.log(`   Compressed: ${compressed.compressed.substring(0, 50)}...`);
        
        console.log('\n2. Testing offer decompression...');
        const decompressed = await decompressOffer(compressed.compressed);
        console.log(`   Decompressed SDP length: ${decompressed.sdp.length} chars`);
        
        // Verify critical fields are preserved
        const checks = {
            'ICE ufrag': decompressed.sdp.includes('a=ice-ufrag:4Xg7'),
            'ICE pwd': decompressed.sdp.includes('a=ice-pwd:by4GZGG1lw+040DWA6hXM5Bz'),
            'Fingerprint': decompressed.sdp.includes('5B:D3:8E:66:0E:7D:D3:F3:8E:E6:80:28:19:FC:55:AD:58:5D:B9:3D:A8:DE:45:4A:E7:87:B0:6A:D9:AE:76:FC'),
            'Host candidate': decompressed.sdp.includes('192.168.1.106'),
            'SRFLX candidate': decompressed.sdp.includes('73.162.94.27')
        };
        
        console.log('\n3. Field preservation checks:');
        let allPassed = true;
        for (const [field, passed] of Object.entries(checks)) {
            console.log(`   ${field}: ${passed ? '✅' : '❌'}`);
            if (!passed) allPassed = false;
        }
        
        if (allPassed) {
            console.log('\n✅ All tests passed!');
        } else {
            console.log('\n❌ Some tests failed!');
        }
        
        return allPassed;
        
    } catch (error) {
        console.error('Self test failed:', error);
        return false;
    }
}

// Default exports
export default {
    compressOffer,
    decompressOffer,
    compressAnswer,
    decompressAnswer,
    runSelfTest
};
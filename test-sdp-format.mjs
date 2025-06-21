#!/usr/bin/env node

// Test SDP format to see what browsers actually accept
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Try to use wrtc (node-webrtc) if available
let RTCPeerConnection;
try {
    const wrtc = require('wrtc');
    RTCPeerConnection = wrtc.RTCPeerConnection;
    console.log('Using node-webrtc for testing');
} catch (e) {
    console.log('node-webrtc not available, using mock test');
    // Create a mock that just validates SDP format
    RTCPeerConnection = class MockRTCPeerConnection {
        async setRemoteDescription(desc) {
            // Basic SDP validation
            const lines = desc.sdp.split(/\r\n|\r|\n/);
            for (const line of lines) {
                if (line.startsWith('a=candidate:')) {
                    // Validate candidate line format
                    const parts = line.split(' ');
                    if (parts.length < 8) {
                        throw new Error(`Invalid candidate line (too few parts): ${line}`);
                    }
                    
                    // Check for common issues
                    const port = parseInt(parts[5]);
                    if (isNaN(port) || port < 1 || port > 65535) {
                        throw new Error(`Invalid port in candidate: ${line}`);
                    }
                    
                    // Check typ field
                    if (parts[6] !== 'typ') {
                        throw new Error(`Missing 'typ' keyword in candidate: ${line}`);
                    }
                    
                    const type = parts[7];
                    if (!['host', 'srflx', 'relay'].includes(type)) {
                        throw new Error(`Invalid candidate type '${type}': ${line}`);
                    }
                    
                    // For srflx, check raddr/rport
                    if (type === 'srflx') {
                        const raddrIdx = parts.indexOf('raddr');
                        const rportIdx = parts.indexOf('rport');
                        if (raddrIdx === -1 || rportIdx === -1) {
                            throw new Error(`srflx candidate missing raddr/rport: ${line}`);
                        }
                    }
                }
            }
            console.log('✓ SDP validation passed');
        }
    };
}

// Test various candidate formats
async function testCandidateFormat(sdp, description) {
    console.log(`\nTesting: ${description}`);
    console.log('SDP:', sdp);
    
    const pc = new RTCPeerConnection();
    try {
        await pc.setRemoteDescription({ type: 'offer', sdp });
        console.log('✅ SUCCESS');
        return true;
    } catch (error) {
        console.log('❌ FAILED:', error.message);
        return false;
    } finally {
        pc.close();
    }
}

async function runTests() {
    const baseSDp = `v=0
o=- 1234567890 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=extmap-allow-mixed
a=msid-semantic: WMS
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:test
a=ice-pwd:testpassword123456789012
a=ice-options:trickle
a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF
a=setup:actpass
a=mid:0
a=sctp-port:5000`;

    // Test 1: Simple host candidate
    await testCandidateFormat(
        baseSDp + '\r\na=candidate:1 1 udp 2122260223 192.168.1.100 50000 typ host generation 0',
        'Simple host candidate'
    );

    // Test 2: Host candidate with network-id
    await testCandidateFormat(
        baseSDp + '\r\na=candidate:1 1 udp 2122260223 192.168.1.100 50000 typ host generation 0 network-id 1',
        'Host candidate with network-id'
    );

    // Test 3: Host candidate with network-id and network-cost
    await testCandidateFormat(
        baseSDp + '\r\na=candidate:1 1 udp 2122260223 192.168.1.100 50000 typ host generation 0 network-id 1 network-cost 10',
        'Host candidate with network-id and network-cost'
    );

    // Test 4: Simple srflx candidate
    await testCandidateFormat(
        baseSDp + '\r\na=candidate:2 1 udp 1686052607 24.17.60.171 50000 typ srflx raddr 192.168.1.100 rport 50000 generation 0',
        'Simple srflx candidate'
    );

    // Test 5: srflx with network-id
    await testCandidateFormat(
        baseSDp + '\r\na=candidate:2 1 udp 1686052607 24.17.60.171 50000 typ srflx raddr 192.168.1.100 rport 50000 generation 0 network-id 1',
        'srflx candidate with network-id'
    );

    // Test 6: srflx with network-id and network-cost
    await testCandidateFormat(
        baseSDp + '\r\na=candidate:2 1 udp 1686052607 24.17.60.171 50000 typ srflx raddr 192.168.1.100 rport 50000 generation 0 network-id 1 network-cost 10',
        'srflx candidate with network-id and network-cost'
    );

    // Test 7: Large foundation numbers
    await testCandidateFormat(
        baseSDp + '\r\na=candidate:100000000 1 udp 2122260223 192.168.1.100 50000 typ host generation 0',
        'Host with large foundation'
    );

    // Test 8: Browser-like format (from logs)
    await testCandidateFormat(
        baseSDp + '\r\na=candidate:1679752656 1 udp 1685855999 24.17.60.171 62688 typ srflx raddr 192.168.1.7 rport 62688 generation 0 network-id 4 network-cost 10',
        'Browser-like srflx format'
    );

    // Test 9: Multiple candidates
    await testCandidateFormat(
        baseSDp + '\r\n' + [
            'a=candidate:1 1 udp 2122260223 192.168.1.100 50000 typ host generation 0',
            'a=candidate:2 1 udp 2122260223 192.168.1.101 50001 typ host generation 0',
            'a=candidate:3 1 udp 1686052607 24.17.60.171 50000 typ srflx raddr 192.168.1.100 rport 50000 generation 0'
        ].join('\r\n'),
        'Multiple candidates'
    );

    // Test 10: With max-message-size
    await testCandidateFormat(
        baseSDp + '\r\na=max-message-size:262144\r\na=candidate:1 1 udp 2122260223 192.168.1.100 50000 typ host generation 0',
        'With max-message-size'
    );
}

console.log('Testing SDP candidate formats...\n');
runTests().catch(console.error);
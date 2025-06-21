#!/usr/bin/env node

// Test the WebRTC compression module in Node.js
import { compressOffer, decompressOffer, compressAnswer, decompressAnswer, runSelfTest } from './webrtc-compress.js';

async function testRealWorldScenario() {
    console.log('\n=== Real World Scenario Test ===\n');
    
    // This is a real SDP from your console output
    const realSDP = `v=0
o=- 4611731400430051336 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=extmap-allow-mixed
a=msid-semantic: WMS
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:qMJJ
a=ice-pwd:miweX+8dKTnAcWXxNUAXg22W
a=ice-options:trickle
a=fingerprint:sha-256 13:2F:20:3F:08:A3:98:AE:6C:7F:DB:E5:70:EE:81:E6:3E:E3:9C:70:7A:06:24:AB:7C:20:0B:CE:CD:9E:70:23
a=setup:actpass
a=mid:0
a=sctp-port:5000
a=candidate:166478707 1 udp 2122260223 169.254.199.180 61063 typ host generation 0 network-id 1
a=candidate:635116650 1 udp 2122194687 172.27.80.1 61064 typ host generation 0 network-id 2
a=candidate:2894833202 1 udp 2122129151 172.27.192.1 61065 typ host generation 0 network-id 3
a=candidate:350042975 1 udp 2122063615 192.168.1.7 61066 typ host generation 0 network-id 4 network-cost 10
a=candidate:832894133 1 udp 1685855999 24.17.60.171 61066 typ srflx raddr 192.168.1.7 rport 61066 generation 0 network-id 4 network-cost 10`;

    try {
        console.log('1. Compressing real offer...');
        const compressed = await compressOffer(realSDP);
        console.log(`   Original SDP: ${realSDP.length} chars`);
        console.log(`   Compressed: ${compressed.compressed.length} chars`);
        console.log(`   Compression ratio: ${(100 - (compressed.compressed.length / realSDP.length * 100)).toFixed(1)}%`);
        console.log(`   QR data: ${compressed.compressed}`);
        
        console.log('\n2. Decompressing...');
        const decompressed = await decompressOffer(compressed.compressed);
        
        console.log('\n3. Comparing candidates:');
        console.log('   Original candidates:');
        const origCandidates = realSDP.split('\n').filter(l => l.includes('a=candidate:'));
        origCandidates.forEach(c => console.log(`     ${c.trim()}`));
        
        console.log('\n   Decompressed candidates:');
        const decompCandidates = decompressed.sdp.split('\n').filter(l => l.includes('a=candidate:'));
        decompCandidates.forEach(c => console.log(`     ${c.trim()}`));
        
        console.log('\n4. Testing problematic srflx line:');
        const srflxLine = decompCandidates.find(l => l.includes('typ srflx'));
        if (srflxLine) {
            console.log(`   SRFLX: ${srflxLine.trim()}`);
            
            // Check the format
            const parts = srflxLine.trim().split(' ');
            console.log(`   Parts count: ${parts.length}`);
            console.log(`   Foundation: ${parts[0]}`);
            console.log(`   Component: ${parts[1]}`);
            console.log(`   Protocol: ${parts[2]}`);
            console.log(`   Priority: ${parts[3]}`);
            console.log(`   IP: ${parts[4]}`);
            console.log(`   Port: ${parts[5]}`);
            
            // Verify it matches expected format
            const isValid = 
                parts[6] === 'typ' &&
                parts[7] === 'srflx' &&
                parts[8] === 'raddr' &&
                parts[10] === 'rport' &&
                parts[12] === 'generation';
                
            console.log(`   Format valid: ${isValid ? '✅' : '❌'}`);
        }
        
        console.log('\n✅ Real world test completed');
        
    } catch (error) {
        console.error('❌ Real world test failed:', error);
    }
}

async function testEdgeCases() {
    console.log('\n=== Edge Case Tests ===\n');
    
    // Test with minimal SDP
    const minimalSDP = `v=0
o=- 1 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=msid-semantic: WMS
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:test
a=ice-pwd:testpassword123456789012
a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF
a=setup:actpass
a=mid:0
a=sctp-port:5000`;

    try {
        console.log('1. Testing minimal SDP (no candidates)...');
        const compressed = await compressOffer(minimalSDP);
        const decompressed = await decompressOffer(compressed.compressed);
        console.log(`   Compression works: ✅`);
        console.log(`   Candidates in decompressed: ${decompressed.offerData.c ? decompressed.offerData.c.length : 0}`);
    } catch (error) {
        console.error('   Minimal SDP test failed:', error.message);
    }
    
    // Test with many candidates
    let manySDP = minimalSDP;
    for (let i = 1; i <= 10; i++) {
        manySDP += `\na=candidate:${i} 1 udp 2122260223 192.168.1.${i} ${50000 + i} typ host generation 0`;
    }
    
    try {
        console.log('\n2. Testing SDP with 10 candidates...');
        const compressed = await compressOffer(manySDP);
        const decompressed = await decompressOffer(compressed.compressed);
        console.log(`   Original size: ${manySDP.length} chars`);
        console.log(`   Compressed size: ${compressed.compressed.length} chars`);
        console.log(`   Compression ratio: ${(100 - (compressed.compressed.length / manySDP.length * 100)).toFixed(1)}%`);
        console.log(`   Candidates preserved: ${decompressed.offerData.c.length === 10 ? '✅' : '❌'}`);
    } catch (error) {
        console.error('   Many candidates test failed:', error.message);
    }
}

async function main() {
    console.log('Testing WebRTC Compression Module\n');
    console.log('='.repeat(50));
    
    // Run the built-in self test
    await runSelfTest();
    
    // Run real world scenario
    await testRealWorldScenario();
    
    // Run edge cases
    await testEdgeCases();
    
    console.log('\n' + '='.repeat(50));
    console.log('All tests completed!');
}

main().catch(console.error);
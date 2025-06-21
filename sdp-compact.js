// Ultra-compact SDP encoding/decoding for minimal QR codes

export function compactSDP(sdp) {
    const lines = sdp.split('\n');
    let ufrag, pwd, fingerprint, setup;
    const candidates = [];
    
    lines.forEach(line => {
        line = line.trim(); // Remove any whitespace/newlines
        if (line.includes('a=ice-ufrag:')) {
            ufrag = line.split('a=ice-ufrag:')[1].trim();
        }
        else if (line.includes('a=ice-pwd:')) {
            pwd = line.split('a=ice-pwd:')[1].trim();
        }
        else if (line.includes('a=fingerprint:')) {
            fingerprint = line.split(' ')[1].trim(); // Just the hex part
        }
        else if (line.includes('a=setup:')) {
            setup = line.split('a=setup:')[1].trim()[0]; // First letter only
        }
        else if (line.includes('a=candidate:')) {
            const parts = line.split(' ');
            // Debug log
            console.log(`compactSDP: Processing candidate line: "${line}"`);
            console.log(`compactSDP: Parts:`, parts);
            
            if (parts.length < 8) {
                console.warn(`compactSDP: Skipping invalid candidate line with ${parts.length} parts`);
                return;
            }
            
            const protocol = parts[2]; // 'udp' or 'tcp'
            const ip = parts[4];
            const port = parts[5];
            const typ = parts[7];
            
            console.log(`compactSDP: Protocol="${protocol}", IP="${ip}", Port="${port}", Type="${typ}"`);
            
            // Skip TCP candidates with port 9 (active TCP candidates)
            if (protocol === 'tcp' && port === '9') {
                console.log(`compactSDP: Skipping TCP active candidate with port 9`);
                return;
            }
            
            if (typ === 'host') {
                // Extract network-id from the line
                let networkId = '1';
                const networkIdMatch = line.match(/network-id (\d+)/);
                if (networkIdMatch) {
                    networkId = networkIdMatch[1];
                }
                candidates.push(`h,${ip}:${port},${networkId}`);
            } else if (typ === 'srflx') {
                // Debug: Print the original srflx candidate line
                console.log(`compactSDP: Found srflx candidate - ORIGINAL LINE: "${line}"`);
                console.log(`compactSDP: srflx parts breakdown:`, {
                    foundation: parts[0],
                    component: parts[1],
                    protocol: parts[2],
                    priority: parts[3],
                    ip: parts[4],
                    port: parts[5],
                    typ_keyword: parts[6],
                    typ_value: parts[7],
                    raddr_keyword: parts[8],
                    raddr_value: parts[9],
                    rport_keyword: parts[10],
                    rport_value: parts[11],
                    generation_keyword: parts[12],
                    generation_value: parts[13],
                    remaining: parts.slice(14).join(' ')
                });
                const raddr = parts[9];
                const rport = parts[11];
                // Extract network-id from the line
                let networkId = '1';
                const networkIdMatch = line.match(/network-id (\d+)/);
                if (networkIdMatch) {
                    networkId = networkIdMatch[1];
                }
                candidates.push(`s,${ip}:${port},${raddr}:${rport},${networkId}`);
            } else if (typ === 'relay') {
                candidates.push(`r,${ip}:${port}`);
            }
        }
    });
    
    console.log(`compactSDP: Returning ${candidates.length} candidates:`, candidates);
    
    return {
        u: ufrag,
        p: pwd,
        f: fingerprint,
        s: setup,
        c: candidates
    };
}

export function expandSDP(compact, type = 'offer') {
    // Ensure we have all required fields
    if (!compact.u || !compact.p || !compact.f) {
        throw new Error('Missing required SDP fields');
    }
    
    const sessionId = Date.now();
    const lines = [
        'v=0',
        `o=- ${sessionId} 2 IN IP4 127.0.0.1`,
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'a=extmap-allow-mixed',
        'a=msid-semantic: WMS',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        'c=IN IP4 0.0.0.0',
        `a=ice-ufrag:${compact.u}`,
        `a=ice-pwd:${compact.p}`,
        'a=ice-options:trickle',
        `a=fingerprint:sha-256 ${compact.f}`,
        `a=setup:${compact.s === 'a' ? 'actpass' : compact.s === 'p' ? 'passive' : 'active'}`,
        'a=mid:0',
        'a=sctp-port:5000'
    ];
    
    // Add candidates
    if (compact.c && Array.isArray(compact.c)) {
        compact.c.forEach((cand, index) => {
        const parts = cand.split(',');
        const type = parts[0];
        
        if (type === 'h') {
            const [ip, port] = parts[1].split(':');
            const networkId = parts[2] || '1';
            // Debug log
            console.log(`expandSDP: host candidate - IP: "${ip}", Port: "${port}", networkId: "${networkId}"`);
            // Use simple sequential foundation numbers
            const foundation = index + 1;
            lines.push(`a=candidate:${foundation} 1 udp 2122260223 ${ip} ${port} typ host generation 0`);
        } else if (type === 's') {
            const [ip, port] = parts[1].split(':');
            const [raddr, rport] = parts[2].split(':');
            const networkId = parts[3] || '1';
            // Debug log
            console.log(`expandSDP: srflx candidate - IP: "${ip}", Port: "${port}", raddr: "${raddr}", rport: "${rport}", networkId: "${networkId}"`);
            // Use simple sequential foundation numbers
            const foundation = index + 1;
            // Minimal srflx candidate without network-id
            // Using browser's actual priority value for srflx candidates
            const srflxLine = `a=candidate:${foundation} 1 udp 1685855999 ${ip} ${port} typ srflx raddr ${raddr} rport ${rport} generation 0`;
            console.log(`expandSDP: Generated srflx candidate line: "${srflxLine}"`);
            lines.push(srflxLine);
        } else if (type === 'r') {
            const [ip, port] = parts[1].split(':');
            // Debug log
            console.log(`expandSDP: relay candidate - IP: "${ip}", Port: "${port}"`);
            const foundation = 300000000 + index;
            lines.push(`a=candidate:${foundation} 1 udp 41885439 ${ip} ${port} typ relay raddr 0.0.0.0 rport 0 generation 0`);
        }
        });
    }
    
    // Note: a=end-of-candidates is not universally supported and can cause parsing errors
    // It's better to omit it and let the browser handle candidate completion
    
    return lines.join('\r\n'); // Use CRLF for proper SDP format
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.compactSDP = compactSDP;
    window.expandSDP = expandSDP;
}
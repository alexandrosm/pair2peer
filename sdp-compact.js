// Ultra-compact SDP encoding/decoding for minimal QR codes

export function compactSDP(sdp) {
    const lines = sdp.split('\n');
    let ufrag, pwd, fingerprint, setup;
    const candidates = [];
    
    lines.forEach(line => {
        if (line.includes('a=ice-ufrag:')) {
            ufrag = line.split('a=ice-ufrag:')[1];
        }
        else if (line.includes('a=ice-pwd:')) {
            pwd = line.split('a=ice-pwd:')[1];
        }
        else if (line.includes('a=fingerprint:')) {
            fingerprint = line.split(' ')[1]; // Just the hex part
        }
        else if (line.includes('a=setup:')) {
            setup = line.split('a=setup:')[1][0]; // First letter only
        }
        else if (line.includes('a=candidate:')) {
            const parts = line.split(' ');
            const ip = parts[4];
            const port = parts[5];
            const typ = parts[7];
            
            if (typ === 'host') {
                candidates.push(`h,${ip}:${port}`);
            } else if (typ === 'srflx') {
                const raddr = parts[9];
                const rport = parts[11];
                candidates.push(`s,${ip}:${port},${raddr}:${rport}`);
            } else if (typ === 'relay') {
                candidates.push(`r,${ip}:${port}`);
            }
        }
    });
    
    return {
        u: ufrag,
        p: pwd,
        f: fingerprint,
        s: setup,
        c: candidates
    };
}

export function expandSDP(compact, type = 'offer') {
    const lines = [
        'v=0',
        'o=- 1 1 IN IP4 0.0.0.0',
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
        'a=sctp-port:5000',
        'a=max-message-size:262144'
    ];
    
    // Add candidates
    compact.c.forEach(cand => {
        const parts = cand.split(',');
        const type = parts[0];
        
        if (type === 'h') {
            const [ip, port] = parts[1].split(':');
            lines.push(`a=candidate:1 1 udp 2122260223 ${ip} ${port} typ host generation 0 ufrag ${compact.u} network-id 1`);
        } else if (type === 's') {
            const [ip, port] = parts[1].split(':');
            const [raddr, rport] = parts[2].split(':');
            lines.push(`a=candidate:2 1 udp 1686052607 ${ip} ${port} typ srflx raddr ${raddr} rport ${rport} generation 0 ufrag ${compact.u} network-id 1`);
        } else if (type === 'r') {
            const [ip, port] = parts[1].split(':');
            lines.push(`a=candidate:3 1 udp 41885439 ${ip} ${port} typ relay raddr 0.0.0.0 rport 0 generation 0 ufrag ${compact.u} network-id 1`);
        }
    });
    
    lines.push('a=end-of-candidates');
    
    return lines.join('\n');
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.compactSDP = compactSDP;
    window.expandSDP = expandSDP;
}
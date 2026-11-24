const { compactSDP } = await import('../../sdp-compact.js');
const { encodeWebRTCData, decodeWebRTCData } = await import('../../asn1-uper-codec.js');
const log = console.log; console.log = () => {};
const sdp = [
 'a=candidate:1 1 udp 2122260223 3f8a2c1e-7b4d-4e2a-9c1f-5d6e7f8a9b0c.local 54321 typ host generation 0 network-id 1',
 'a=candidate:2 1 udp 1685855999 203.0.113.7 54321 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-id 1',
 'a=ice-ufrag:TIcR','a=ice-pwd:n8rkDYXwaKZDIfwboX43SJsC',
 'a=fingerprint:sha-256 9A:A4:AE:E0:0B:73:65:00:37:32:97:39:7C:EF:EC:69:26:E6:87:87:78:85:D8:20:E0:69:F4:8C:B7:21:DC:DE',
 'a=setup:actpass'].join('\r\n');
const c = compactSDP(sdp);
let rt; try { rt = decodeWebRTCData(encodeWebRTCData({t:'o',...c})); } catch(e) { rt = {err:String(e)}; }
console.log = log;
console.log('compact candidates:', c.c);
console.log('after round trip:  ', rt.c || rt.err);

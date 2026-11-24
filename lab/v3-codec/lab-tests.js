// Browser-side experiments. Each exported function runs inside headless Chrome.

export function waitGather(pc, ms = 4000) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); }
    });
  });
}

export function waitOpen(dc, ms = 8000) {
  return new Promise(res => {
    if (dc.readyState === 'open') return res(true);
    const t = setTimeout(() => res(false), ms);
    dc.onopen = () => { clearTimeout(t); res(true); };
  });
}

// Full offer/answer between two local peers. toRemoteOffer/toRemoteAnswer turn
// the local SDP into whatever the other side receives (e.g. encode -> decode -> expand).
export async function connectPair({ toRemoteOffer = s => s, toRemoteAnswer = s => s,
                                    mungeOffer = s => s, mungeAnswer = s => s,
                                    certA, certB, timeout = 8000 } = {}) {
  const a = new RTCPeerConnection(certA ? { certificates: [certA] } : {});
  const b = new RTCPeerConnection(certB ? { certificates: [certB] } : {});
  const dc = a.createDataChannel('x');
  let bdc; b.ondatachannel = e => { bdc = e.channel; };
  const info = {};
  try {
    const offer = await a.createOffer();
    await a.setLocalDescription({ type: 'offer', sdp: mungeOffer(offer.sdp) });
    await waitGather(a);
    info.offerSdp = a.localDescription.sdp;
    await b.setRemoteDescription({ type: 'offer', sdp: await toRemoteOffer(info.offerSdp) });
    const answer = await b.createAnswer();
    await b.setLocalDescription({ type: 'answer', sdp: mungeAnswer(answer.sdp) });
    await waitGather(b);
    info.answerSdp = b.localDescription.sdp;
    await a.setRemoteDescription({ type: 'answer', sdp: await toRemoteAnswer(info.answerSdp) });
    info.open = await waitOpen(dc, timeout);
    if (info.open) {
      const got = new Promise(r => { const iv = setInterval(() => { if (bdc) { clearInterval(iv); bdc.onmessage = e => r(e.data); } }, 20); });
      dc.send('ping');
      info.message = await Promise.race([got, new Promise(r => setTimeout(() => r(null), 2000))]);
      const stats = await a.getStats();
      stats.forEach(s => {
        if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') {
          const remote = stats.get(s.remoteCandidateId);
          info.remoteCandidateType = remote && remote.candidateType;
        }
      });
    }
    info.dtlsA = a.sctp && a.sctp.transport.state;
    info.iceA = a.iceConnectionState;
  } catch (e) {
    info.error = String(e && e.message || e);
  } finally {
    a.close(); b.close();
  }
  return info;
}

const silence = async fn => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };

// 1. Capture real SDPs and measure the current pair2peer codec on them,
//    including a full connection through the current encode/decode/expand path.
export async function captureAndMeasureCurrent() {
  const { compactSDP, expandSDP } = await import('/repo/sdp-compact.js');
  const { encodeWebRTCData, decodeWebRTCData } = await import('/repo/asn1-uper-codec.js');
  const sizes = {};
  const via = (t) => async (sdp) => silence(() => {
    const bytes = encodeWebRTCData({ t: t[0], ...compactSDP(sdp) });
    sizes[t] = bytes.length;
    return expandSDP(decodeWebRTCData(bytes), t);
  });
  const r = await connectPair({ toRemoteOffer: via('offer'), toRemoteAnswer: via('answer') });
  return { sizes, open: r.open, message: r.message, error: r.error, offerSdp: r.offerSdp, answerSdp: r.answerSdp, remoteCandidateType: r.remoteCandidateType };
}

// 2. Can we set our own ICE ufrag/pwd (munging the local description)?
export async function mungedCredentials() {
  const set = (u, p) => s => s.replace(/a=ice-ufrag:.*\r\n/g, `a=ice-ufrag:${u}\r\n`).replace(/a=ice-pwd:.*\r\n/g, `a=ice-pwd:${p}\r\n`);
  const out = {};
  out.valid = await connectPair({ mungeOffer: set('abcd', 'abcdefghijklmnopqrstuv'), mungeAnswer: set('wxyz', 'ABCDEFGHIJKLMNOPQRSTUV') });
  // also check the munged values actually ended up on the wire
  out.offerHasMunged = /a=ice-ufrag:abcd\r\n/.test(out.valid.offerSdp || '');
  out.tooShortPwd = await connectPair({ mungeOffer: set('abcd', 'short') });
  return { valid: { open: out.valid.open, error: out.valid.error, offerHasMunged: out.offerHasMunged },
           tooShortPwd: { open: out.tooShortPwd.open, error: out.tooShortPwd.error } };
}

async function digestHex(alg, buf) {
  const h = new Uint8Array(await crypto.subtle.digest(alg, buf));
  return Array.from(h, b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

// Learn the DER of our own persistent certificate by connecting it to a throwaway
// local peer and asking that peer for the remote certificate.
export async function certDer(cert) {
  const a = new RTCPeerConnection({ certificates: [cert] });
  const b = new RTCPeerConnection();
  const dc = a.createDataChannel('x');
  a.onicecandidate = e => e.candidate && b.addIceCandidate(e.candidate);
  b.onicecandidate = e => e.candidate && a.addIceCandidate(e.candidate);
  await a.setLocalDescription(); await b.setRemoteDescription(a.localDescription);
  await b.setLocalDescription(); await a.setRemoteDescription(b.localDescription);
  await waitOpen(dc);
  const der = b.sctp.transport.getRemoteCertificates()[0];
  a.close(); b.close();
  return der;
}

// 3. Will Chrome verify the peer with a SHA-1 fingerprint (20 bytes instead of 32)?
export async function fingerprintAlgorithms() {
  const certA = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
  const der = await certDer(certA);
  const sha1 = await digestHex('SHA-1', der);
  const sha256 = await digestHex('SHA-256', der);
  const reported = certA.getFingerprints();
  const swapFp = (alg, fp) => s => s.replace(/a=fingerprint:.*\r\n/g, `a=fingerprint:${alg} ${fp}\r\n`);
  const wrong = sha1.replace(/^../, sha1.startsWith('00') ? '11' : '00');
  const ok = await connectPair({ certA, toRemoteOffer: swapFp('sha-1', sha1) });
  const bad = await connectPair({ certA, toRemoteOffer: swapFp('sha-1', wrong), timeout: 4000 });
  return {
    reportedByChrome: reported,
    derBytes: der.byteLength,
    sha256MatchesSdp: reported.some(f => f.value.toUpperCase() === sha256),
    sha1Correct: { open: ok.open, error: ok.error },
    sha1Wrong: { open: bad.open, error: bad.error, dtls: bad.dtlsA },
  };
}

// 4. Peer-reflexive: can one side send no candidates at all?
export async function oneSidedCandidates() {
  const strip = s => s.split('\r\n').filter(l => !l.startsWith('a=candidate') && !l.startsWith('a=end-of-candidates')).join('\r\n');
  const answerless = await connectPair({ toRemoteAnswer: strip });
  const offerless = await connectPair({ toRemoteOffer: strip });
  const neither = await connectPair({ toRemoteOffer: strip, toRemoteAnswer: strip, timeout: 4000 });
  const pick = r => ({ open: r.open, remoteCandidateTypeSeenByOfferer: r.remoteCandidateType, error: r.error });
  return { answerHasNoCandidates: pick(answerless), offerHasNoCandidates: pick(offerless), neitherHasCandidates: pick(neither) };
}

// 5. What a host candidate looks like when Chrome hides local IPs (no camera permission yet),
//    and what the current encoder does with it.
export async function mdnsCandidates() {
  const { compactSDP } = await import('/repo/sdp-compact.js');
  const { encodeWebRTCData, decodeWebRTCData } = await import('/repo/asn1-uper-codec.js');
  const pc = new RTCPeerConnection();
  pc.createDataChannel('x');
  await pc.setLocalDescription();
  await waitGather(pc);
  const sdp = pc.localDescription.sdp;
  pc.close();
  const compact = await silence(() => compactSDP(sdp));
  let roundTrip;
  try { roundTrip = await silence(() => decodeWebRTCData(encodeWebRTCData({ t: 'o', ...compact }))); }
  catch (e) { roundTrip = { error: String(e) }; }
  return { candidateLines: sdp.split('\r\n').filter(l => l.startsWith('a=candidate')), compactCandidates: compact.c, roundTripCandidates: roundTrip.c, roundTripFingerprintIntact: roundTrip.f === compact.f };
}

// ---------- v3 codec, end to end in Chrome ----------

async function sha1Of(cert) {
  const der = await certDer(cert);
  return new Uint8Array(await crypto.subtle.digest('SHA-1', der));
}

export async function v3Tiers() {
  const v3 = await import('/repo/sdp-codec-v3.js');
  const { compactSDP } = await import('/repo/sdp-compact.js');
  const { encodeWebRTCData } = await import('/repo/asn1-uper-codec.js');
  const v2size = (sdp, t) => silence(() => encodeWebRTCData({ t, ...compactSDP(sdp) }).length);
  const fakeSrflx = s => s.replace(/(a=candidate:[^\r]*typ host[^\r]*\r\n)/, (m, l) => {
    const port = l.split(' ')[5];
    return l + `a=candidate:99 1 udp 1686052607 203.0.113.77 ${port} typ srflx raddr 0.0.0.0 rport 0 generation 0 network-id 1\r\n`;
  });

  const certA = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
  const certB = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
  const sha1A = await sha1Of(certA), sha1B = await sha1Of(certB);

  const tiers = {
    'v2 (current)':                          { v2: true },
    'v3 safe':                               { offer: {}, answer: {} },
    'v3 + LAN one-sided (answer no cands)':  { offer: { policy: 'lan' }, answer: { policy: 'none' } },
    'v3 + sha-1 fingerprint':                { offer: { policy: 'lan' }, answer: { policy: 'none' }, sha1: true },
    'v3 + derived creds (sha-256)':          { offer: { policy: 'lan' }, answer: { policy: 'none' }, derived: true },
    'v3 + sha-1 + derived creds':            { offer: { policy: 'lan' }, answer: { policy: 'none' }, sha1: true, derived: true },
  };
  const results = {};
  for (const [name, t] of Object.entries(tiers)) {
    for (const withSrflx of [false, true]) {
      const sizes = {};
      const fpFor = (side, sdp) => t.sha1 ? (side === 'offer' ? sha1A : sha1B) : v3.parseSDP(sdp).fp;
      const munge = side => sdp => t.derived ? v3.withDerivedCreds(sdp, fpFor(side, sdp)) : sdp;
      const via = side => async sdp => {
        if (side === 'offer' && withSrflx) sdp = fakeSrflx(sdp);
        if (t.v2) { sizes[side] = await v2size(sdp, side[0]); return sdp; }
        const bytes = v3.encodeSDP(sdp, side, { ...t[side], derived: !!t.derived, sha1: t.sha1 ? fpFor(side) : null });
        sizes[side] = bytes.length;
        return v3.decodeToSDP(bytes);
      };
      const r = await connectPair({
        certA: t.sha1 ? certA : undefined, certB: t.sha1 ? certB : undefined,
        mungeOffer: munge('offer'), mungeAnswer: munge('answer'),
        toRemoteOffer: via('offer'), toRemoteAnswer: via('answer'),
      });
      results[`${name}${withSrflx ? ' [+srflx]' : ''}`] = { offer: sizes.offer, answer: sizes.answer, connected: r.open, error: r.error };
    }
  }
  return results;
}

// Repeat pairing: both sides kept their certificates and stored each other's sha-1 last time.
// Only ONE QR (offerer's candidates) goes one way; the offerer invents the answer locally.
export async function knownPeerReconnect() {
  const v3 = await import('/repo/sdp-codec-v3.js');
  const certA = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
  const certB = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
  const sha1A = await sha1Of(certA), sha1B = await sha1Of(certB);
  const credsA = v3.deriveCreds(sha1A), credsB = v3.deriveCreds(sha1B);

  const a = new RTCPeerConnection({ certificates: [certA] });
  const b = new RTCPeerConnection({ certificates: [certB] });
  const dc = a.createDataChannel('x');
  try {
    // A: real offer with derived creds; then immediately apply an answer it synthesizes for B.
    const offer = await a.createOffer();
    await a.setLocalDescription({ type: 'offer', sdp: v3.withDerivedCreds(offer.sdp, sha1A) });
    await waitGather(a);
    const qrCands = v3.selectCandidates(v3.parseSDP(a.localDescription.sdp).cands, { policy: 'lan' });
    await a.setRemoteDescription({ type: 'answer', sdp: v3.toSDP({ type: 'answer', ...credsB, fpAlg: 'sha-1', fp: sha1B, cands: [] }) });

    // QR payload: type(1) + known-peer flag(1) + peer slot(8) + candidates. Measure with a writer.
    const bits = 1 + 1 + 8 + qrCands.length + 1 + qrCands.reduce((n, c, i) => n + 1 + (c.addr.startsWith('192.168.') ? 18 : c.addr.startsWith('10.') ? 26 : 35) + (i ? 1 : 16), 0);

    // B: rebuilds A's offer from the stored sha-1 + scanned candidates, answers (never sent).
    await b.setRemoteDescription({ type: 'offer', sdp: v3.toSDP({ type: 'offer', ...credsA, fpAlg: 'sha-1', fp: sha1A, cands: qrCands }) });
    const ans = await b.createAnswer();
    await b.setLocalDescription({ type: 'answer', sdp: v3.withDerivedCreds(ans.sdp, sha1B) });
    const open = await waitOpen(dc);
    return { connected: open, qrBits: bits, qrBytes: Math.ceil(bits / 8), candidatesInQr: qrCands.length };
  } catch (e) {
    return { error: String(e.message || e) };
  } finally { a.close(); b.close(); }
}

// libwebrtc credential shape, sampled
export async function credShape() {
  let ok = 0, n = 60;
  for (let i = 0; i < n; i++) {
    const pc = new RTCPeerConnection(); pc.createDataChannel('x');
    const { sdp } = await pc.createOffer(); pc.close();
    const u = sdp.match(/a=ice-ufrag:(\S+)/)[1], p = sdp.match(/a=ice-pwd:(\S+)/)[1];
    if (/^[A-Za-z0-9+/]{4}$/.test(u) && /^[A-Za-z0-9+/]{24}$/.test(p)) ok++;
  }
  return { sampled: n, matching4plus24Base64: ok };
}

// ---------- answer over the network instead of a second QR ----------
const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const toB64 = bytes => { let s = '', acc = 0, n = 0; for (const x of bytes) { acc = (acc << 8) | x; n += 8; while (n >= 6) { n -= 6; s += B64C[(acc >> n) & 63]; } } if (n) s += B64C[(acc << (6 - n)) & 63]; return s; };
const fromB64 = (s, len) => { const out = []; let acc = 0, n = 0; for (const ch of s) { acc = (acc << 6) | B64C.indexOf(ch); n += 6; if (n >= 8) { n -= 8; out.push((acc >> n) & 255); } } return new Uint8Array(out.slice(0, len)); };

// A shows ONE QR (its offer). B answers locally, putting its own fingerprint in its ICE ufrag
// and reusing A's ICE password. B's connectivity checks carry that ufrag to A; A reads it from
// getStats(), rebuilds B's answer, and connects. No second QR.
export async function networkAnswer({ answerDelayProbe = false } = {}) {
  const v3 = await import('/repo/sdp-codec-v3.js');
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  const dc = a.createDataChannel('x');
  let bdc; b.ondatachannel = e => { bdc = e.channel; };
  const out = {};
  try {
    await a.setLocalDescription(); await waitGather(a);
    const qr = v3.encodeSDP(a.localDescription.sdp, 'offer', { policy: 'lan' });
    out.qrBytes = qr.length;

    // --- B (scanner) ---
    const offer = v3.decode(qr);
    await b.setRemoteDescription({ type: 'offer', sdp: v3.toSDP(offer) });
    const ans = await b.createAnswer();
    const fpB = v3.parseSDP(ans.sdp).fp;
    const ufragB = toB64(fpB);                         // 43 chars
    await b.setLocalDescription({ type: 'answer', sdp: ans.sdp
      .replace(/a=ice-ufrag:\S+/, `a=ice-ufrag:${ufragB}`)
      .replace(/a=ice-pwd:\S+/, `a=ice-pwd:${offer.pwd}`) });
    out.bMungeAccepted = true;

    // --- A (QR shower): watch stats for B's ufrag ---
    const t0 = performance.now();
    let seen = null, sample = null;
    while (!seen && performance.now() - t0 < 10000) {
      const stats = await a.getStats();
      stats.forEach(s => {
        if (s.type === 'remote-candidate') {
          sample = sample || { candidateType: s.candidateType, usernameFragment: s.usernameFragment, address: s.address, port: s.port };
          if (s.usernameFragment && s.usernameFragment.length === 43) seen = s.usernameFragment;
        }
      });
      if (!seen) await new Promise(r => setTimeout(r, 100));
    }
    out.remoteCandidateSeenByA = sample;
    out.msUntilUfragVisible = seen ? Math.round(performance.now() - t0) : null;
    if (!seen) return out;
    const fpLearned = fromB64(seen, 32);
    out.fingerprintMatches = fpLearned.every((x, i) => x === fpB[i]);
    await a.setRemoteDescription({ type: 'answer', sdp: v3.toSDP({ type: 'answer', ufrag: seen, pwd: offer.pwd, fpAlg: 'sha-256', fp: fpLearned, cands: [] }) });
    out.connected = await waitOpen(dc);
    out.msTotal = Math.round(performance.now() - t0);
    if (out.connected) {
      const got = new Promise(r => { const iv = setInterval(() => { if (bdc) { clearInterval(iv); bdc.onmessage = e => r(e.data); } }, 20); });
      dc.send('hello over the network answer');
      out.messageAtB = await Promise.race([got, new Promise(r => setTimeout(() => r(null), 2000))]);
    }
  } catch (e) { out.error = String(e.message || e); }
  finally { a.close(); b.close(); }
  return out;
}

// Negative control: a stranger who did NOT scan the QR (wrong ICE password) should never
// show up in A's stats, because A only answers checks signed with its own password.
export async function networkAnswerStranger() {
  const v3 = await import('/repo/sdp-codec-v3.js');
  const a = new RTCPeerConnection(), m = new RTCPeerConnection();
  a.createDataChannel('x');
  try {
    await a.setLocalDescription(); await waitGather(a);
    const offer = v3.decode(v3.encodeSDP(a.localDescription.sdp, 'offer', { policy: 'lan' }));
    const guessed = { ...offer, pwd: 'X'.repeat(24) };        // knows address + fingerprint, not the password
    await m.setRemoteDescription({ type: 'offer', sdp: v3.toSDP(guessed) });
    const ans = await m.createAnswer();
    await m.setLocalDescription({ type: 'answer', sdp: ans.sdp.replace(/a=ice-ufrag:\S+/, 'a=ice-ufrag:' + 'M'.repeat(43)).replace(/a=ice-pwd:\S+/, 'a=ice-pwd:' + 'X'.repeat(24)) });
    await new Promise(r => setTimeout(r, 4000));
    let seen = 0;
    (await a.getStats()).forEach(s => { if (s.type === 'remote-candidate') seen++; });
    return { remoteCandidatesSeenByA: seen };
  } finally { a.close(); m.close(); }
}

// B's ICE credentials are derived from A's (so A knows them in advance); only B's
// fingerprint is unknown to A. Probe: does a failed DTLS handshake still reveal B's cert?
const credsForB = offer => ({ ufrag: offer.ufrag + 'B', pwd: offer.pwd });
const PLACEHOLDER_FP = new Uint8Array(32).fill(0xAB);

async function bAnswer(v3, pc, offerInfo) {
  await pc.setRemoteDescription({ type: 'offer', sdp: v3.toSDP(offerInfo) });
  const ans = await pc.createAnswer();
  const c = credsForB(offerInfo);
  await pc.setLocalDescription({ type: 'answer', sdp: ans.sdp.replace(/a=ice-ufrag:\S+/, `a=ice-ufrag:${c.ufrag}`).replace(/a=ice-pwd:\S+/, `a=ice-pwd:${c.pwd}`) });
  return v3.parseSDP(ans.sdp).fp;
}

function waitDtls(pc, states, ms = 8000) {
  return new Promise(res => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      const st = pc.sctp && pc.sctp.transport.state;
      if (states.includes(st) || performance.now() - t0 > ms) { clearInterval(iv); res(st); }
    }, 50);
  });
}

export async function probeCertFromFailure() {
  const v3 = await import('/repo/sdp-codec-v3.js');
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.createDataChannel('x');
  const out = {};
  try {
    await a.setLocalDescription(); await waitGather(a);
    const offer = v3.decode(v3.encodeSDP(a.localDescription.sdp, 'offer', { policy: 'lan' }));
    const fpB = await bAnswer(v3, b, offer);
    const cB = credsForB(offer);
    await a.setRemoteDescription({ type: 'answer', sdp: v3.toSDP({ type: 'answer', ...cB, fpAlg: 'sha-256', fp: PLACEHOLDER_FP, cands: [] }) });
    out.dtlsState = await waitDtls(a, ['failed', 'connected']);
    const certs = a.sctp.transport.getRemoteCertificates();
    out.remoteCertsAfterFailure = certs.length;
    if (certs.length) {
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', certs[0]));
      out.learnedMatchesB = h.every((x, i) => x === fpB[i]);
    }
  } catch (e) { out.error = String(e.message || e); }
  finally { a.close(); b.close(); }
  return out;
}

// Full protocol, no second QR: A shows one QR with two ports (probe + real connection).
// Round 1 (probe): A learns B's cert from a handshake that fails on purpose.
// Round 2 (real): A applies an answer with the learned fingerprint; B has been waiting.
export async function twoRoundNetworkAnswer() {
  const v3 = await import('/repo/sdp-codec-v3.js');
  const certA = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
  const certB = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
  const a1 = new RTCPeerConnection({ certificates: [certA] }), a2 = new RTCPeerConnection({ certificates: [certA] });
  const b1 = new RTCPeerConnection({ certificates: [certB] }), b2 = new RTCPeerConnection({ certificates: [certB] });
  a1.createDataChannel('probe'); const dc = a2.createDataChannel('real');
  let bdc; b2.ondatachannel = e => { bdc = e.channel; };
  const out = {};
  try {
    // A: two offers sharing one cert and one set of ICE credentials.
    const o1 = await a1.createOffer(); await a1.setLocalDescription(o1);
    const { ufrag, pwd } = v3.parseSDP(o1.sdp);
    const o2 = await a2.createOffer();
    await a2.setLocalDescription({ type: 'offer', sdp: o2.sdp.replace(/a=ice-ufrag:\S+/, `a=ice-ufrag:${ufrag}`).replace(/a=ice-pwd:\S+/, `a=ice-pwd:${pwd}`) });
    await Promise.all([waitGather(a1), waitGather(a2)]);
    const p1 = v3.selectCandidates(v3.parseSDP(a1.localDescription.sdp).cands, { policy: 'lan' })[0];
    const p2 = v3.selectCandidates(v3.parseSDP(a2.localDescription.sdp).cands, { policy: 'lan' })[0];
    const base = v3.decode(v3.encodeSDP(a1.localDescription.sdp, 'offer', { policy: 'lan' }));
    // QR = normal v3 offer + one extra port (17 bits): measure by encoding both candidates.
    const twoCandSdp = a1.localDescription.sdp.replace(/(a=candidate:[^\r]*typ host[^\r]*\r\n)/, `$1a=candidate:7 1 udp 2122260222 ${p2.addr} ${p2.port} typ host generation 0\r\n`);
    out.qrBytes = v3.encodeSDP(twoCandSdp, 'offer', { policy: 'lan' }).length;

    // B: scans, answers both (same cert, credentials derived from A's).
    const t0 = performance.now();
    const fpB = await bAnswer(v3, b1, { ...base, cands: [p1] });
    await bAnswer(v3, b2, { ...base, cands: [p2] });

    // A, round 1: placeholder fingerprint, learn B's real one from the failed handshake.
    const cB = credsForB(base);
    await a1.setRemoteDescription({ type: 'answer', sdp: v3.toSDP({ type: 'answer', ...cB, fpAlg: 'sha-256', fp: PLACEHOLDER_FP, cands: [] }) });
    out.round1 = await waitDtls(a1, ['failed', 'connected']);
    const cert = a1.sctp.transport.getRemoteCertificates()[0];
    if (!cert) { out.error = 'no remote certificate after failure'; return out; }
    const learned = new Uint8Array(await crypto.subtle.digest('SHA-256', cert));
    out.learnedMatchesB = learned.every((x, i) => x === fpB[i]);
    out.msRound1 = Math.round(performance.now() - t0);

    // A, round 2: real answer for a2.
    await a2.setRemoteDescription({ type: 'answer', sdp: v3.toSDP({ type: 'answer', ...cB, fpAlg: 'sha-256', fp: learned, cands: [] }) });
    out.connected = await waitOpen(dc, 15000);
    out.msTotal = Math.round(performance.now() - t0);
    if (out.connected) {
      const got = new Promise(r => { const iv = setInterval(() => { if (bdc) { clearInterval(iv); bdc.onmessage = e => r(e.data); } }, 20); });
      dc.send('no second QR');
      out.messageAtB = await Promise.race([got, new Promise(r => setTimeout(() => r(null), 3000))]);
    }
  } catch (e) { out.error = String(e.message || e); }
  finally { [a1, a2, b1, b2].forEach(p => p.close()); }
  return out;
}

export async function probeCertViaStats() {
  const v3 = await import('/repo/sdp-codec-v3.js');
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.createDataChannel('x');
  const out = { certStatsSeen: [] };
  try {
    await a.setLocalDescription(); await waitGather(a);
    const offer = v3.decode(v3.encodeSDP(a.localDescription.sdp, 'offer', { policy: 'lan' }));
    const fpB = await bAnswer(v3, b, offer);
    const fpBHex = Array.from(fpB, x => x.toString(16).padStart(2, '0')).join(':');
    await a.setRemoteDescription({ type: 'answer', sdp: v3.toSDP({ type: 'answer', ...credsForB(offer), fpAlg: 'sha-256', fp: PLACEHOLDER_FP, cands: [] }) });
    const t0 = performance.now();
    while (performance.now() - t0 < 5000) {             // poll fast through the handshake
      const stats = await a.getStats();
      stats.forEach(s => {
        if (s.type === 'certificate' && !out.certStatsSeen.includes(s.fingerprint)) out.certStatsSeen.push(s.fingerprint);
        if (s.type === 'transport') out.transport = { dtlsState: s.dtlsState, remoteCertificateId: s.remoteCertificateId || null };
      });
      if (out.certStatsSeen.some(f => f.toLowerCase() === fpBHex)) { out.gotPeerFingerprint = true; break; }
      await new Promise(r => setTimeout(r, 10));
    }
    out.gotPeerFingerprint = !!out.gotPeerFingerprint;
  } catch (e) { out.error = String(e.message || e); }
  finally { a.close(); b.close(); }
  return out;
}

// ---------- can the fingerprint itself get shorter? ----------
function md5(bytes) {   // compact RFC 1321 implementation (WebCrypto has no MD5)
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const len = bytes.length, padded = new Uint8Array(((len + 8) >> 6) * 64 + 64);
  padded.set(bytes); padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, (len * 8) >>> 0, true); dv.setUint32(padded.length - 4, Math.floor(len / 2 ** 29), true);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let off = 0; off < padded.length; off += 64) {
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const tmp = D; D = C; C = B;
      const x = (A + F + K[i] + dv.getUint32(off + g * 4, true)) >>> 0;
      const s = S[(i >> 4) * 4 + (i % 4)];
      B = (B + ((x << s) | (x >>> (32 - s)))) >>> 0; A = tmp;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16), ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((w, i) => ov.setUint32(i * 4, w, true));
  return out;
}

export async function shorterFingerprints() {
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const known = hex(md5(new TextEncoder().encode('abc')));   // self-test: 90015098...
  const certA = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
  const der = new Uint8Array(await certDer(certA));
  const swap = (alg, fp) => s => s.replace(/a=fingerprint:.*\r\n/g, `a=fingerprint:${alg} ${fp}\r\n`);
  const tryAlg = async (alg, fp) => { const r = await connectPair({ certA, toRemoteOffer: swap(alg, fp), timeout: 5000 }); return r.open ? 'connected' : (r.error ? 'rejected: ' + r.error.split(':').slice(-1)[0].trim() : 'failed'); };
  const md5fp = hex(md5(der));
  const wrongMd5 = md5fp.replace(/^../, md5fp.startsWith('00') ? '11' : '00');
  return {
    md5SelfTestOk: known.replace(/:/g, '').toLowerCase() === '900150983cd24fb0d6963f7d28e17f72',
    md5Correct: await tryAlg('md5', md5fp),
    md5Wrong: await tryAlg('md5', wrongMd5),
  };
}

// How fast can a device grind certificates so its SHA-256 fingerprint starts with zero bits?
export async function grindRate({ ms = 3000 } = {}) {
  const t0 = performance.now();
  let n = 0, bestZeros = 0;
  while (performance.now() - t0 < ms) {
    const c = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
    const fp = c.getFingerprints()[0].value.replace(/:/g, '');
    const lead = BigInt('0x' + fp).toString(2).padStart(256, '0').indexOf('1');
    bestZeros = Math.max(bestZeros, lead); n++;
  }
  const perSec = n / ((performance.now() - t0) / 1000);
  // SHA-1 needs the DER, i.e. a loopback connection per certificate:
  const t1 = performance.now(); let m = 0;
  while (performance.now() - t1 < ms) { await certDer(await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' })); m++; }
  return { sha256CertsPerSec: Math.round(perSec), bestLeadingZeroBitsIn3s: bestZeros, sha1CertsPerSec: +(m / ((performance.now() - t1) / 1000)).toFixed(1) };
}

// ---------- the exact path index.html uses ----------
// compactSDP -> encodeWebRTCData (v3) -> QR bytes -> decodeWebRTCData (v3) -> expandSDP -> connect
export async function appPath() {
  const { compactSDP, expandSDP } = await import('/repo/sdp-compact.js');
  const { encodeWebRTCData, decodeWebRTCData } = await import('/repo/sdp-codec-v3.js');
  const sizes = {};
  const via = t => async sdp => silence(() => {
    const bytes = encodeWebRTCData({ t: t[0], ...compactSDP(sdp) });
    sizes[t] = bytes.length;
    const obj = decodeWebRTCData(Array.from(bytes));          // jsQR hands back a plain Array
    if (obj.t !== t[0]) throw new Error('type mismatch');
    return expandSDP(obj, t);
  });
  const r = await connectPair({ toRemoteOffer: via('offer'), toRemoteAnswer: via('answer') });

  // the app's built-in self test (index.html "TEST 2: Simple Known Data")
  const testData = { t: 'o', u: 'TEST', p: 'TestPassword123456789012',
    f: '01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF',
    s: 'a', c: ['h,192.168.1.100:12345,1', 's,203.0.113.1:54321,0.0.0.0:0,1'] };
  const back = decodeWebRTCData(encodeWebRTCData(testData));
  const selfTest = ['t', 'u', 'p', 'f', 's'].every(k => back[k] === testData[k]) && JSON.stringify(back.c) === JSON.stringify(testData.c);
  const expanded = expandSDP(back, 'offer');
  const pc = new RTCPeerConnection(); let parses = true;
  try { await pc.setRemoteDescription({ type: 'offer', sdp: expanded }); } catch { parses = false; } finally { pc.close(); }

  return { sizes, connected: r.open, error: r.error, appSelfTestRoundTrip: selfTest, appSelfTestSdpParses: parses, emptyObjectSize: encodeWebRTCData({}).length };
}

# pair2peer v3 codec lab

Tests and measurements for `../../sdp-codec-v3.js`. The app (`index.html`) uses it through the same
`encodeWebRTCData` / `decodeWebRTCData` interface the old ASN.1 UPER codec had, with the "v3 safe" tier below.
The other tiers are available in the module but not wired into the app yet.

```js
import { encodeSDP, decodeToSDP, withDerivedCreds, parseSDP } from '../../sdp-codec-v3.js';

// sender
const bytes = encodeSDP(pc.localDescription.sdp, 'offer');      // Uint8Array -> binary QR
// receiver
await pc.setRemoteDescription({ type: 'offer', sdp: decodeToSDP(bytes) });
```

## Tiers (all verified connecting in Chrome 153)

| Tier | What it needs | Offer / answer (192.168 LAN host) | QR (EC level L) |
|---|---|---|---|
| v2 (before) | — | 72 / 72 B (85 B with srflx) | v4 (v5) |
| **v3 safe** | nothing, just the new codec | 58 / 58 B (63 B with srflx) | v4 |
| + one-sided candidates | `policy: 'lan'` on one side, `'none'` on the other; same network only | 58 / 54 B | v4 |
| + SHA-1 fingerprint | `RTCPeerConnection` created with a generated certificate; learn its SHA-1 once via `certDer()` loopback (see lab-tests.js); pass `sha1` | 46 / 42 B | v3 |
| + derived ICE creds | munge local SDP with `withDerivedCreds()` before `setLocalDescription`; pass `derived: true` | 38 / 33 B | v3 |
| + both | both of the above | 26 / 21 B | v2 |
| known-peer reconnect | persistent certificates + stored peer SHA-1s; one QR, one direction | ~6 B | v1 |

The SHA-1 and derived-creds tiers rely on browser behaviour (SHA-1 remote fingerprints,
`getRemoteCertificates()`, local ufrag/pwd munging) verified in Chrome only. Test Safari and
Firefox before shipping them.

## Running

```bash
npm install            # puppeteer-core, qrcode
npm run unit           # codec round trips (node)
npm run sizes          # payload sizes + QR versions (node)
node harness.mjs appPath            # the exact compactSDP -> v3 -> expandSDP path index.html uses
node harness.mjs v3Tiers            # end-to-end connections in headless Chrome, every tier
node harness.mjs knownPeerReconnect
node harness.mjs oneSidedCandidates
```

Set `CHROME_PATH` if Chrome isn't at `/usr/bin/google-chrome`. Add `--mdns` to keep Chrome's
local-IP hiding on.

## Answer over the network instead of a second QR (Chrome 153 results)

| Experiment | Result |
|---|---|
| `networkAnswer` — scanner puts its fingerprint in its ICE ufrag; QR shower reads it from `getStats()` | Doesn't work: the prflx remote candidate shows up, but `usernameFragment` (and the address) are hidden |
| `probeCertFromFailure` — handshake with a placeholder fingerprint, then `getRemoteCertificates()` | Returns nothing after the verification failure |
| `probeCertViaStats` — certificate entries in `getStats()` after the failure | Only the local certificate is listed |
| `networkAnswerStranger` — peer without the QR's ICE password | Never appears at all: only someone who saw the QR can even reach the QR shower |
| `knownPeerReconnect` (above) | Works: no return path needed once fingerprints are known |

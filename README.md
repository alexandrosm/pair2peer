# Pair2Peer - Direct Device Pairing Web App

A lightweight PWA for establishing encrypted direct device WebRTC connections without servers, using QR code exchange.

## Features

- **Server-less operation**: Works entirely offline after initial load
- **<200KB gzipped**: Minimal dependencies, framework-free TypeScript
- **Secure pairing**: 4-digit PairCode + SDP fingerprint verification
- **Universal compatibility**: Works on all modern browsers with WebRTC support
- **Fallback options**: Manual copy/paste when cameras unavailable

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

## Deployment

The app can be deployed to any static hosting service:

```bash
npm run build
# Upload contents of dist/ folder
```

For offline use, serve the files over HTTPS to enable PWA installation.

## Architecture

- `src/app.ts` - Main application logic and state machine
- `src/webrtc.ts` - WebRTC connection establishment
- `src/qr.ts` - QR generation and scanning functionality
- `src/types.ts` - TypeScript type definitions
- `src/worker.ts` - Service worker for offline caching

## Browser Support

- **Full support**: Chrome, Edge, Brave, Safari (iOS 15.4+)
- **Scan-only**: Firefox (due to ImageCapture API limitations)

## QR payload encoding (v3)

Offers and answers are packed by `sdp-codec-v3.js` (see `lab/v3-codec/` for tests and measurements):
a typical offer with one local candidate is 58 bytes instead of 72 (85 → 63 with a public-address
candidate), and `.local` (mDNS) candidates are now encoded correctly instead of corrupting the payload.
The format is not compatible with v2 (ASN.1 UPER): both devices need the same app version.

## Security

- All connections are end-to-end encrypted via WebRTC DTLS
- PairCode prevents accidental cross-pairing
- SDP fingerprint verification prevents MITM attacks
- Optional TURN credentials can be embedded in QR payload

## Development

### Version Management

The version is maintained in `package.json` as the single source of truth. Use npm's version commands:

```bash
# Bump patch version (e.g., 2.2.0 -> 2.2.1)
npm version patch

# Bump minor version (e.g., 2.2.0 -> 2.3.0)
npm version minor

# Bump major version (e.g., 2.2.0 -> 3.0.0)
npm version major
```

The `version:sync` script automatically updates the version in:
- `version.js` - Used by the app
- `sw.js` - Service worker cache version
- `index.html` - Meta tag

This runs automatically when you use `npm version`.
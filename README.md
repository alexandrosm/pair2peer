# PeerPair - P2P Pairing Web App

A lightweight PWA for establishing encrypted peer-to-peer WebRTC connections without servers, using QR code exchange.

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

## Security

- All connections are end-to-end encrypted via WebRTC DTLS
- PairCode prevents accidental cross-pairing
- SDP fingerprint verification prevents MITM attacks
- Optional TURN credentials can be embedded in QR payload
# Deployment Guide for Pair2Peer

## GitHub Pages Deployment

The app is now configured for deployment to GitHub Pages at the `/pair2peer/` subdirectory.

### Build Process
1. Run `npm install` to install dependencies including Tailwind CSS
2. Run `npm run build` to build the production version
3. The `dist/` folder contains all the files needed for deployment

### Configuration Changes Made
- **Base Path**: Set to `/pair2peer/` in `vite.config.ts`
- **Tailwind CSS**: Replaced CDN with build-time compilation
- **Resource Paths**: Updated manifest.json and service worker registration
- **Static Assets**: Moved to `public/` folder for proper handling

### Files Structure
```
dist/
├── index.html          # Main app file
├── main.js            # Bundled JavaScript
├── main.css           # Compiled Tailwind CSS
├── worker.js          # Service worker
├── manifest.json      # PWA manifest
├── icon-192.png       # App icon (192x192)
└── icon-512.png       # App icon (512x512)
```

### Deployment Steps
1. Commit changes to your repository
2. Push to GitHub
3. Enable GitHub Pages in repository settings
4. Set source to the `gh-pages` branch or `dist` folder
5. Access your app at `https://yourusername.github.io/pair2peer/`

### Features Fixed
✅ Tailwind CSS build process (no more CDN)  
✅ Correct resource paths for subdirectory deployment  
✅ Service worker registration with proper path  
✅ PWA manifest with correct start URL and icon paths  
✅ All static assets properly bundled  

The app is now production-ready for GitHub Pages deployment!
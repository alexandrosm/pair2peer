#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get version and build info
const version = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
const buildTime = new Date().toISOString();
const gitCommit = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.substring(0, 7) : 'local';

// Generate a unique build hash
const buildHash = crypto.createHash('md5').update(`${version}-${buildTime}-${gitCommit}`).digest('hex').substring(0, 8);

console.log(`Building Pair2Peer v${version} with cache bust hash: ${buildHash}`);

// Files to process
const htmlFiles = ['index.html', 'index-embedded.html'];
const jsModules = ['version.js', 'sdp-compact.js', 'asn1-uper-codec.js', 'binary-codec.js', 'crc.js'];

// Process HTML files
htmlFiles.forEach(htmlFile => {
    const htmlPath = path.join(__dirname, htmlFile);
    if (!fs.existsSync(htmlPath)) {
        console.log(`Skipping ${htmlFile} (not found)`);
        return;
    }
    
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // Add cache bust to local JS modules
    jsModules.forEach(jsFile => {
        const regex = new RegExp(`(['"])(\\.?/?${jsFile})(['"])`, 'g');
        html = html.replace(regex, `$1$2?v=${buildHash}$3`);
    });
    
    // Add cache bust to external CDN resources (but keep them at specific versions for stability)
    html = html.replace(
        /src="https:\/\/cdn\.tailwindcss\.com"/g,
        `src="https://cdn.tailwindcss.com?v=${buildHash}"`
    );
    
    // Update version display
    html = html.replace(
        /VERSION = '[^']*'/g,
        `VERSION = '${version}'`
    );
    html = html.replace(
        /GIT_COMMIT = '[^']*'/g,
        `GIT_COMMIT = '${gitCommit}'`
    );
    
    // Add timestamp meta tag if not present
    if (!html.includes('meta name="build-time"')) {
        html = html.replace(
            '</head>',
            `    <meta name="build-time" content="${buildTime}">
    <meta name="build-hash" content="${buildHash}">
</head>`
        );
    } else {
        // Update existing meta tags
        html = html.replace(
            /meta name="build-time" content="[^"]*"/,
            `meta name="build-time" content="${buildTime}"`
        );
        html = html.replace(
            /meta name="build-hash" content="[^"]*"/,
            `meta name="build-hash" content="${buildHash}"`
        );
    }
    
    // Write to dist directory
    const distPath = path.join(__dirname, 'dist', htmlFile);
    fs.mkdirSync(path.dirname(distPath), { recursive: true });
    fs.writeFileSync(distPath, html);
    console.log(`✓ Processed ${htmlFile} -> dist/${htmlFile}`);
});

// Copy other files to dist
const filesToCopy = [
    ...jsModules,
    'public/manifest.json',
    'public/favicon.ico',
    'public/icon-192.png',
    'public/icon-512.png'
];

filesToCopy.forEach(file => {
    const srcPath = path.join(__dirname, file);
    const destPath = path.join(__dirname, 'dist', path.basename(file));
    
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`✓ Copied ${file} -> dist/${path.basename(file)}`);
    }
});

// Create a version info file
const versionInfo = {
    version,
    buildTime,
    buildHash,
    gitCommit,
    files: jsModules.map(f => ({ name: f, url: `${f}?v=${buildHash}` }))
};

fs.writeFileSync(
    path.join(__dirname, 'dist', 'version-info.json'),
    JSON.stringify(versionInfo, null, 2)
);
console.log('✓ Created version-info.json');

// Update service worker if it exists
const swPath = path.join(__dirname, 'sw.js');
if (fs.existsSync(swPath)) {
    let sw = fs.readFileSync(swPath, 'utf8');
    
    // Update cache name with build hash
    sw = sw.replace(
        /const CACHE_NAME = '[^']*'/,
        `const CACHE_NAME = 'pair2peer-v${version}-${buildHash}'`
    );
    
    // Update the files list with cache bust parameters
    const cacheFiles = [
        '/',
        '/index.html',
        ...jsModules.map(f => `/${f}?v=${buildHash}`)
    ];
    
    sw = sw.replace(
        /const urlsToCache = \[[^\]]*\]/s,
        `const urlsToCache = ${JSON.stringify(cacheFiles, null, 2)}`
    );
    
    fs.writeFileSync(path.join(__dirname, 'dist', 'sw.js'), sw);
    console.log('✓ Updated service worker');
}

console.log(`\n✅ Build complete! Cache bust hash: ${buildHash}`);
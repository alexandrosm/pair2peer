#!/usr/bin/env node

// Script to sync version from package.json to all other files
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Read version from package.json (single source of truth)
const packageFile = './package.json';
const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'));
const version = packageJson.version;

console.log(`Syncing version ${version} from package.json to all files...`);

// Update version.js
const versionFile = './version.js';
let versionContent = readFileSync(versionFile, 'utf8');
versionContent = versionContent.replace(/VERSION = '[\d.]+'/g, `VERSION = '${version}'`);

// Update build date with static timestamp
const buildDate = new Date().toISOString();
versionContent = versionContent.replace(/BUILD_DATE = '[^']+'/g, `BUILD_DATE = '${buildDate}'`);

// Update git commit
try {
    const gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    versionContent = versionContent.replace(/GIT_COMMIT = '[^']+'/g, `GIT_COMMIT = '${gitCommit}'`);
} catch (e) {
    console.warn('Could not get git commit hash');
}

writeFileSync(versionFile, versionContent);
console.log('✓ Updated version.js');

// Update sw.js
const swFile = './sw.js';
let swContent = readFileSync(swFile, 'utf8');
swContent = swContent.replace(/const CACHE_VERSION = '[\d.]+'/g, `const CACHE_VERSION = '${version}'`);
writeFileSync(swFile, swContent);
console.log('✓ Updated sw.js');

// Update index.html meta tag
const htmlFile = './index.html';
let htmlContent = readFileSync(htmlFile, 'utf8');
htmlContent = htmlContent.replace(/<meta name="version" content="[\d.]+"/g, `<meta name="version" content="${version}"`);
writeFileSync(htmlFile, htmlContent);
console.log('✓ Updated index.html meta tag');

console.log(`\nAll files synced to version ${version} from package.json`);
console.log('To change version: npm version patch/minor/major');
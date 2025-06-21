#!/usr/bin/env node

// Script to update version number across the project
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Usage: node update-version.js <version>');
    console.error('Example: node update-version.js 1.4.1');
    process.exit(1);
}

// Validate version format
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error('Version must be in format X.Y.Z');
    process.exit(1);
}

console.log(`Updating version to ${newVersion}...`);

// Update version.js
const versionFile = './version.js';
let versionContent = readFileSync(versionFile, 'utf8');
versionContent = versionContent.replace(/VERSION = '[\d.]+'/g, `VERSION = '${newVersion}'`);

// Update git commit
try {
    const gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    versionContent = versionContent.replace(/GIT_COMMIT = '[^']+'/g, `GIT_COMMIT = '${gitCommit}'`);
} catch (e) {
    console.warn('Could not get git commit hash');
}

writeFileSync(versionFile, versionContent);
console.log('✓ Updated version.js');

// Update package.json
const packageFile = './package.json';
const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'));
packageJson.version = newVersion;
writeFileSync(packageFile, JSON.stringify(packageJson, null, 2) + '\n');
console.log('✓ Updated package.json');

console.log(`\nVersion updated to ${newVersion}`);
console.log('Run "git add -A && git commit -m "Bump version to ' + newVersion + '"" to commit the changes');
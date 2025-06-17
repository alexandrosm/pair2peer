import { createServer } from 'net';
import { createHash } from 'crypto';
import { basename, resolve } from 'path';

// Generate a deterministic hash from the directory name
function generateSeed(dirName) {
  const hash = createHash('md5').update(dirName).digest('hex');
  // Convert first 8 hex chars to a number
  return parseInt(hash.substring(0, 8), 16);
}

// Simple deterministic random number generator
function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

// Check if a port is available
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port, '0.0.0.0');
  });
}

// Get the preferred port for this project (deterministic)
function getPreferredPort(dirName, minPort = 3000, maxPort = 9999) {
  const seed = generateSeed(dirName);
  const random = seededRandom(seed);
  const portRange = maxPort - minPort + 1;
  
  // Always return the same "preferred" port for this directory
  return Math.floor(random() * portRange) + minPort;
}

// Find an available port using directory-seeded randomization
export async function findAvailablePort(minPort = 3000, maxPort = 9999, forcePreferred = false) {
  const dirName = basename(resolve('.'));
  const preferredPort = getPreferredPort(dirName, minPort, maxPort);
  
  console.log(`🔍 Finding port for project: ${dirName}`);
  console.log(`🎯 Preferred port: ${preferredPort}`);
  
  // First, always try the preferred port
  if (await isPortAvailable(preferredPort)) {
    console.log(`✅ Using preferred port: ${preferredPort}`);
    return preferredPort;
  }
  
  if (forcePreferred) {
    throw new Error(`Preferred port ${preferredPort} is not available`);
  }
  
  console.log(`⚠️  Preferred port ${preferredPort} is taken, searching for alternatives...`);
  
  const seed = generateSeed(dirName);
  const random = seededRandom(seed);
  const portRange = maxPort - minPort + 1;
  const portsToTry = new Set();
  
  // Generate deterministic backup ports
  for (let i = 1; i <= 50; i++) { // Start from 1 to skip the preferred port
    const port = Math.floor(random() * portRange) + minPort;
    if (port !== preferredPort) {
      portsToTry.add(port);
    }
  }
  
  // Try each backup port in order
  for (const port of portsToTry) {
    if (await isPortAvailable(port)) {
      console.log(`✅ Found fallback port: ${port}`);
      return port;
    }
  }
  
  // If all seeded ports are taken, scan sequentially
  console.log('⚠️  All seeded ports taken, scanning for any available port...');
  const startPort = Math.floor(random() * portRange) + minPort;
  
  for (let offset = 0; offset < portRange; offset++) {
    const port = ((startPort - minPort + offset) % portRange) + minPort;
    if (await isPortAvailable(port)) {
      console.log(`✅ Found emergency port: ${port}`);
      return port;
    }
  }
  
  throw new Error('No available ports found in the specified range');
}

// Get the preferred port without checking availability
export function getProjectPreferredPort(minPort = 3000, maxPort = 9999) {
  const dirName = basename(resolve('.'));
  return getPreferredPort(dirName, minPort, maxPort);
}
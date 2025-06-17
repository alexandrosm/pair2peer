#!/usr/bin/env node
import { findAvailablePort, getProjectPreferredPort } from './findPort.js';
import { basename, resolve } from 'path';

async function showPort() {
  try {
    const dirName = basename(resolve('.'));
    const preferredPort = getProjectPreferredPort(3000, 9999);
    console.log(`📁 Project: ${dirName}`);
    console.log(`Preferred port for this project: ${preferredPort}`);
    
    const availablePort = await findAvailablePort(3000, 9999);
    console.log(`Port that would be used: ${availablePort}`);
    
    if (preferredPort === availablePort) {
      console.log(`\n✅ Using preferred port!`);
    } else {
      console.log(`\n⚠️  Preferred port ${preferredPort} is taken, using fallback ${availablePort}`);
    }
    
    console.log(`\nAccess your app at: http://localhost:${availablePort}`);
  } catch (error) {
    console.error('Error finding port:', error);
  }
}

showPort();
#!/usr/bin/env node
import { spawn } from 'child_process';
import { findAvailablePort } from './findPort.js';
import { createHash } from 'crypto';
import { basename, resolve } from 'path';
import fs from 'fs';

// Generate a unique project ID based on directory path
function getProjectId() {
  const fullPath = resolve('.');
  const hash = createHash('md5').update(fullPath).digest('hex');
  return hash.substring(0, 8);
}

// Get project-specific file names
function getProjectFiles() {
  const projectId = getProjectId();
  const projectName = basename(resolve('.'));
  return {
    pidFile: `.vite-${projectId}.pid`,
    portFile: `.vite-${projectId}.port`,
    lockFile: `.vite-${projectId}.lock`,
    logFile: `.vite-${projectId}.log`,
    errorLogFile: `.vite-${projectId}.error.log`,
    projectName,
    projectId
  };
}

// Log a message with timestamp
function log(message, file) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  try {
    fs.appendFileSync(file, logMessage);
  } catch (e) {
    console.error(`Failed to write to log file: ${e.message}`);
  }
}

async function startInBackground() {
  const { pidFile, portFile, lockFile, logFile, errorLogFile, projectName, projectId } = getProjectFiles();
  
  // Check if already running
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
    try {
      process.kill(pid, 0);
      console.log(`⚠️  Server already running for ${projectName}!`);
      console.log(`   PID: ${pid}`);
      if (fs.existsSync(portFile)) {
        console.log(`   Port: ${fs.readFileSync(portFile, 'utf8').trim()}`);
      }
      process.exit(0);
    } catch (e) {
      // Process not running, clean up
      [pidFile, portFile, lockFile].forEach(f => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
    }
  }
  
  const port = await findAvailablePort();
  
  // Initialize log files
  log(`Starting background dev server for project: ${projectName}`, logFile);
  log(`Project ID: ${projectId}`, logFile);
  log(`Target port: ${port}`, logFile);
  
  // IMPORTANT: Use 'ignore' for stdio in background processes
  // Do NOT use WriteStream objects - they cause ERR_INVALID_ARG_VALUE errors
  const child = spawn('npx', ['vite', '--port', port.toString(), '--host'], {
    detached: true,
    stdio: 'ignore'  // This is crucial for background execution
  });
  
  // Allow parent to exit
  child.unref();
  
  // Save info
  fs.writeFileSync(pidFile, child.pid.toString());
  fs.writeFileSync(portFile, port.toString());
  fs.writeFileSync(lockFile, JSON.stringify({
    projectName,
    projectId,
    startTime: new Date().toISOString(),
    pid: child.pid
  }));
  
  // Log the startup info
  log(`Server started with PID: ${child.pid}`, logFile);
  
  console.log(`✅ Server started in background!`);
  console.log(`   Project: ${projectName}`);
  console.log(`   PID: ${child.pid}`);
  console.log(`   Port: ${port}`);
  console.log(`   URL: http://localhost:${port}`);
  console.log(`   Logs: ${logFile}`);
  console.log(`   Error logs: ${errorLogFile}`);
  console.log(`   Stop with: npm run stop`);
  
  // Handle child process errors
  child.on('error', (error) => {
    log(`Background process error: ${error.message}`, errorLogFile);
    console.error(`Failed to start background server: ${error.message}`);
  });
}

startInBackground().catch((error) => {
  console.error('Failed to start server:', error);
  const { errorLogFile } = getProjectFiles();
  log(`Startup failed: ${error.message}\n${error.stack}`, errorLogFile);
});
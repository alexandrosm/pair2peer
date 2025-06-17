import { spawn, execSync } from 'child_process';
import { createHash } from 'crypto';
import { basename, resolve } from 'path';
import fs from 'fs';
import { findAvailablePort } from './findPort.js';

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

// Check if a process is running
function isProcessRunning(pid) {
  try {
    // Send signal 0 to check if process exists
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// Read PID from file
function readPidFile(pidFile) {
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
    return isNaN(pid) ? null : pid;
  } catch (e) {
    return null;
  }
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

// Start the dev server
export async function startDevServer() {
  const { pidFile, portFile, lockFile, logFile, errorLogFile, projectName, projectId } = getProjectFiles();
  
  console.log(`🔍 Project: ${projectName} (ID: ${projectId})`);
  
  // Check if server is already running for this project
  const existingPid = readPidFile(pidFile);
  if (existingPid && isProcessRunning(existingPid)) {
    const existingPort = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').trim() : 'unknown';
    console.log(`⚠️  Server already running for this project!`);
    console.log(`   PID: ${existingPid}`);
    console.log(`   Port: ${existingPort}`);
    console.log(`   URL: http://localhost:${existingPort}`);
    console.log(`   Stop with: npm run stop`);
    return;
  }
  
  // Clean up stale files if process is not running
  if (existingPid && !isProcessRunning(existingPid)) {
    console.log(`🧹 Cleaning up stale server files (PID ${existingPid} not running)`);
    [pidFile, portFile, lockFile].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  }
  
  // Find available port
  const port = await findAvailablePort();
  
  console.log(`🚀 Starting dev server on port ${port}...`);
  
  // Initialize logs
  log(`Starting dev server for project: ${projectName}`, logFile);
  log(`Project ID: ${projectId}`, logFile);
  log(`Target port: ${port}`, logFile);
  
  // Create lock file
  fs.writeFileSync(lockFile, JSON.stringify({
    projectName,
    projectId,
    startTime: new Date().toISOString(),
    pid: process.pid
  }));
  
  // Start Vite
  const viteProcess = spawn('npx', ['vite', '--port', port.toString(), '--host'], {
    stdio: 'inherit',
    env: { ...process.env },
    detached: false
  });
  
  // Save PID and port
  fs.writeFileSync(pidFile, viteProcess.pid.toString());
  fs.writeFileSync(portFile, port.toString());
  
  log(`Server started with PID: ${viteProcess.pid}`, logFile);
  
  console.log(`✅ Server started!`);
  console.log(`   Project: ${projectName}`);
  console.log(`   PID: ${viteProcess.pid}`);
  console.log(`   Port: ${port}`);
  console.log(`   URL: http://localhost:${port}`);
  
  // Handle cleanup on exit
  const cleanup = () => {
    console.log('\n🛑 Shutting down dev server...');
    log('Server shutting down', logFile);
    [pidFile, portFile, lockFile].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  viteProcess.on('exit', (code) => {
    console.log(`Dev server exited with code ${code}`);
    log(`Server exited with code ${code}`, logFile);
    cleanup();
    process.exit(code);
  });
  
  viteProcess.on('error', (error) => {
    log(`Server error: ${error.message}`, errorLogFile);
    console.error(`Server error: ${error.message}`);
  });
}

// Stop the dev server
export function stopDevServer() {
  const { pidFile, portFile, lockFile, logFile, projectName, projectId } = getProjectFiles();
  
  console.log(`🔍 Project: ${projectName} (ID: ${projectId})`);
  
  const pid = readPidFile(pidFile);
  
  if (!pid) {
    console.log(`❌ No server running for this project`);
    return;
  }
  
  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`✅ Stopped dev server (PID: ${pid})`);
      log(`Server stopped (PID: ${pid})`, logFile);
    } catch (e) {
      console.error(`❌ Failed to stop server: ${e.message}`);
      log(`Failed to stop server: ${e.message}`, logFile);
    }
  } else {
    console.log(`⚠️  Server process (PID: ${pid}) not found`);
  }
  
  // Clean up files
  [pidFile, portFile, lockFile].forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
}

// Show status of dev server
export function showDevServerStatus() {
  const { pidFile, portFile, lockFile, logFile, errorLogFile, projectName, projectId } = getProjectFiles();
  
  console.log(`🔍 Project: ${projectName} (ID: ${projectId})`);
  
  const pid = readPidFile(pidFile);
  
  if (!pid) {
    console.log(`❌ No server configured for this project`);
    return;
  }
  
  const port = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').trim() : 'unknown';
  const isRunning = isProcessRunning(pid);
  
  if (isRunning) {
    console.log(`✅ Server is running`);
    console.log(`   PID: ${pid}`);
    console.log(`   Port: ${port}`);
    console.log(`   URL: http://localhost:${port}`);
    
    if (fs.existsSync(lockFile)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        console.log(`   Started: ${lockData.startTime}`);
      } catch (e) {
        // Ignore
      }
    }
  } else {
    console.log(`❌ Server is not running (stale PID: ${pid})`);
    console.log(`   Run 'npm run dev' to start`);
    
    // Check for recent errors
    if (fs.existsSync(errorLogFile)) {
      try {
        const errorLog = fs.readFileSync(errorLogFile, 'utf8');
        const recentErrors = errorLog.split('\n').slice(-5).filter(line => line.trim());
        if (recentErrors.length > 0) {
          console.log(`   Recent errors:`);
          recentErrors.forEach(error => console.log(`     ${error}`));
        }
      } catch (e) {
        // Ignore
      }
    }
  }
}

// Show logs
export function showLogs(type = 'all') {
  const { logFile, errorLogFile, projectName, projectId } = getProjectFiles();
  
  console.log(`🔍 Project: ${projectName} (ID: ${projectId})`);
  
  const targetFile = type === 'error' ? errorLogFile : logFile;
  
  if (!fs.existsSync(targetFile)) {
    console.log(`❌ No ${type} logs found`);
    return;
  }
  
  try {
    const logs = fs.readFileSync(targetFile, 'utf8');
    const lines = logs.split('\n').filter(line => line.trim());
    const recentLines = lines.slice(-100); // Last 100 lines
    
    console.log(`📋 Last ${recentLines.length} lines of ${type} logs:`);
    console.log('─'.repeat(60));
    recentLines.forEach(line => console.log(line));
  } catch (e) {
    console.error(`❌ Failed to read log file: ${e.message}`);
  }
}

// List all running dev servers on this machine
export function listAllDevServers() {
  console.log(`🔍 Searching for all Vite dev servers...\n`);
  
  const viteFiles = fs.readdirSync('.')
    .filter(f => f.startsWith('.vite-') && f.endsWith('.lock'));
  
  if (viteFiles.length === 0) {
    console.log(`No dev servers found in current directory`);
    return;
  }
  
  viteFiles.forEach(lockFile => {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      const pidFile = lockFile.replace('.lock', '.pid');
      const portFile = lockFile.replace('.lock', '.port');
      
      const pid = readPidFile(pidFile);
      const port = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').trim() : 'unknown';
      const isRunning = pid && isProcessRunning(pid);
      
      console.log(`📦 Project: ${lockData.projectName}`);
      console.log(`   ID: ${lockData.projectId}`);
      console.log(`   Status: ${isRunning ? '🟢 Running' : '🔴 Stopped'}`);
      if (isRunning) {
        console.log(`   PID: ${pid}`);
        console.log(`   Port: ${port}`);
        console.log(`   URL: http://localhost:${port}`);
      }
      console.log(`   Started: ${lockData.startTime}`);
      console.log('');
    } catch (e) {
      console.error(`Error reading ${lockFile}: ${e.message}`);
    }
  });
}

// CLI interface
const command = process.argv[2];
const subCommand = process.argv[3];

switch (command) {
  case 'start':
    startDevServer();
    break;
  case 'stop':
    stopDevServer();
    break;
  case 'status':
    showDevServerStatus();
    break;
  case 'logs':
    showLogs(subCommand);
    break;
  case 'list':
    listAllDevServers();
    break;
  default:
    console.log(`Usage: node dev-manager.js [start|stop|status|logs|list]`);
    console.log(`  start  - Start dev server for this project`);
    console.log(`  stop   - Stop dev server for this project`);
    console.log(`  status - Show status of this project's server`);
    console.log(`  logs   - Show logs (logs [error] for error-only)`);
    console.log(`  list   - List all dev servers in current directory`);
}
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { findAvailablePort } from './findPort.js';

export default defineConfig(async () => {
  // Find an available port based on directory name
  const port = await findAvailablePort(3000, 9999);
  
  return {
    root: '.',
    base: '/pair2peer/',
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          worker: resolve(__dirname, 'src/worker.ts')
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]'
        }
      },
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      }
    },
    server: {
      // Critical for WSL2: Listen on all network interfaces
      host: true,
      port: port,
      strictPort: true,  // Use the exact port we found
      open: true,
      
      // WSL2 file watching optimizations
      watch: {
        // REQUIRED for WSL2: Use polling instead of native file watchers
        usePolling: true,
        
        // Poll interval in ms (lower = more responsive, higher = less CPU)
        interval: 100,
        
        // Paths to ignore for performance
        ignored: ['**/node_modules/**', '**/.git/**'],
        
        // Use native file system events when possible (faster than polling)
        useFsEvents: false, // Disable for WSL2 compatibility
        
        // Await write finish
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 10
        }
      },
      
      // HMR configuration for WSL2
      hmr: {
        // Use WebSocket protocol
        protocol: 'ws',
        
        // Use the Windows host IP or 'localhost'
        host: 'localhost',
        
        // Client-side HMR timeout
        timeout: 60000,
        
        // Enable overlay for errors
        overlay: true
      },
      
      // CORS settings for cross-origin requests
      cors: true
    },
    
    // Optimize dependency resolution for WSL2
    resolve: {
      // Required for symlinks across Windows/WSL boundary
      preserveSymlinks: true
    },
    
    // Performance optimizations
    optimizeDeps: {
      // Force consistent optimization
      force: true
    },
    
    // Clear screen on restart
    clearScreen: false,
    
    publicDir: 'public'
  };
});
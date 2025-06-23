// Create a bundled version of lean-qr
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the lean-qr source
const leanQrPath = path.join(__dirname, 'node_modules', 'lean-qr', 'dist', 'lean-qr.min.js');
const leanQrSource = fs.readFileSync(leanQrPath, 'utf8');

// Create a module wrapper
const bundledSource = `// Bundled lean-qr library
${leanQrSource}

// Export the lean-qr functions
export const { generate } = window.leanQR || {};
`;

// Write to our qr-lean-bundled.js file
fs.writeFileSync(path.join(__dirname, 'qr-lean-bundled.js'), bundledSource);

console.log('Successfully bundled lean-qr');
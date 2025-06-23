// Bundle lean-qr for browser use
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the ES module version
const leanQrPath = path.join(__dirname, 'node_modules', 'lean-qr', 'index.mjs');
let source;

try {
    source = fs.readFileSync(leanQrPath, 'utf8');
} catch (e) {
    // Try the CommonJS version
    const cjsPath = path.join(__dirname, 'node_modules', 'lean-qr', 'index.js');
    const cjsSource = fs.readFileSync(cjsPath, 'utf8');
    
    // Convert CommonJS to ES module
    source = cjsSource
        .replace(/exports\./g, 'const leanQR = {}; leanQR.')
        .replace(/module\.exports\s*=\s*/, 'export default ')
        + '\nexport const { generate, correction, mode } = leanQR || exports || {};';
}

// Create bundled version
const bundled = `// Bundled lean-qr library for browser use
${source}
`;

fs.writeFileSync(path.join(__dirname, 'lean-qr-bundled.js'), bundled);
console.log('Bundled lean-qr successfully');
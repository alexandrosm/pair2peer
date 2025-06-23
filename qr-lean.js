// QR code generation using bundled lean-qr library
// This provides better control over encoding modes

import { generate } from './lean-qr-bundled.js';

export async function generateLeanQR(container, data, options = {}) {
    // Clear container
    container.innerHTML = '';
    
    // Generate QR code with lean-qr
    const qr = generate(data, {
        minCorrectionLevel: 0, // L
        maxCorrectionLevel: 0  // L
    });
    
    // Create canvas element
    const canvas = document.createElement('canvas');
    
    // Use lean-qr's toCanvas method
    qr.toCanvas(canvas, {
        on: [255, 255, 255], // White modules
        off: [0, 0, 0, 0],   // Transparent background
        padX: 0,
        padY: 0
    });
    
    // Style the canvas
    canvas.style.background = options.colorLight || '#000000';
    
    // Scale to desired size
    if (options.width) {
        canvas.style.width = options.width + 'px';
        canvas.style.height = options.width + 'px';
        canvas.style.imageRendering = 'pixelated';
    }
    
    container.appendChild(canvas);
    
    // Log stats
    const modules = qr.size;
    const version = Math.floor((modules - 21) / 4) + 1;
    console.log(`lean-qr: v${version} (${modules}×${modules} modules)`);
    console.log(`Data: ${data.length} chars`);
    console.log(`Is alphanumeric: ${/^[0-9A-Z $%*+\-./:]+$/.test(data)}`);
    
    return { canvas, qr };
}

// Helper for Base45 with potential alphanumeric optimization
export async function generateBase45QR(container, data, options = {}) {
    // Verify Base45 is alphanumeric
    if (!/^[0-9A-Z $%*+\-./:]+$/.test(data)) {
        console.warn('Base45 data contains non-alphanumeric characters:', 
            data.split('').filter(c => !/[0-9A-Z $%*+\-./:]+/.test(c)).join('')
        );
    }
    // lean-qr will automatically detect if data can use alphanumeric mode
    return generateLeanQR(container, data, options);
}

// Helper for binary data
export async function generateBinaryQR(container, binaryData, options = {}) {
    // Convert Uint8Array to string for byte mode
    let str = '';
    for (let i = 0; i < binaryData.length; i++) {
        str += String.fromCharCode(binaryData[i]);
    }
    
    return generateLeanQR(container, str, options);
}
// QR code generation using lean-qr library loaded from CDN
// This provides better control over encoding modes

let leanQR = null;

// Load lean-qr from CDN
async function loadLeanQR() {
    if (leanQR) return leanQR;
    
    // Load the library
    const module = await import('https://unpkg.com/lean-qr@2.5.0/dist/lean-qr.min.js');
    leanQR = module;
    return leanQR;
}

export async function generateLeanQR(container, data, options = {}) {
    const { generate } = await loadLeanQR();
    
    // Clear container
    container.innerHTML = '';
    
    // Generate QR code
    const qr = generate(data);
    
    // Create canvas
    const canvas = qr.toCanvas({
        on: options.colorDark || '#ffffff',
        off: options.colorLight || '#000000',
        scale: 1
    });
    
    // Scale to desired size
    if (options.width) {
        const scale = options.width / canvas.width;
        canvas.style.width = options.width + 'px';
        canvas.style.height = options.width + 'px';
        canvas.style.imageRendering = 'pixelated';
    }
    
    container.appendChild(canvas);
    
    // Log stats
    const modules = canvas.width; // Before scaling
    const version = Math.floor((modules - 21) / 4) + 1;
    console.log(`lean-qr: v${version} (${modules}×${modules} modules)`);
    
    return { canvas, qr };
}

// Helper for Base45 with potential alphanumeric optimization
export async function generateBase45QR(container, data, options = {}) {
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
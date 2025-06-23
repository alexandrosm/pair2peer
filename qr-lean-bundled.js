// This file was supposed to contain bundled lean-qr but is a placeholder
// The actual lean-qr is imported in qr-lean.js
// Export empty functions to prevent errors

export async function generateLeanQR(container, data, options = {}) {
    console.error('qr-lean-bundled.js: This is a placeholder file. Use qr-lean.js instead.');
    return { canvas: null };
}

export async function generateBase45QR(container, data, options = {}) {
    return generateLeanQR(container, data, options);
}
// Simple QR code implementation using qrcode-generator
import qrcode from 'qrcode-generator';

export function generateQRCanvas(data) {
    console.log('Generating QR canvas for data length:', data.length);
    
    try {
        // Create QR code
        const qr = qrcode(0, 'M'); // Type 0 = auto, error correction level M
        qr.addData(data);
        qr.make();
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const moduleCount = qr.getModuleCount();
        const cellSize = 4;
        const margin = cellSize * 2;
        
        canvas.width = moduleCount * cellSize + margin * 2;
        canvas.height = moduleCount * cellSize + margin * 2;
        
        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw QR modules
        ctx.fillStyle = '#000000';
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(
                        col * cellSize + margin,
                        row * cellSize + margin,
                        cellSize,
                        cellSize
                    );
                }
            }
        }
        
        console.log('QR canvas generated successfully');
        return canvas;
    } catch (error) {
        console.error('Error generating QR canvas:', error);
        
        // Fallback: create a text display
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 300;
        canvas.height = 300;
        
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#333';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('QR Generation Failed', canvas.width/2, canvas.height/2 - 20);
        ctx.fillText('Use manual entry', canvas.width/2, canvas.height/2);
        
        return canvas;
    }
}

// Simple QR scanner using jsQR
export async function scanQRFromVideo(videoElement) {
    try {
        // Dynamic import of jsQR
        const jsQR = (await import('https://cdn.skypack.dev/jsqr')).default;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code) {
            console.log('QR code detected:', code.data);
            return code.data;
        }
        
        return null;
    } catch (error) {
        console.error('QR scanning error:', error);
        return null;
    }
}
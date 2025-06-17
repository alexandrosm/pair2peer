// Pair2Peer - Simple Implementation
console.log('Pair2Peer starting...');

// Import QR functionality
import qrcode from 'qrcode-generator';

// App state
const state = {
    step: 'start',
    pc: null,
    dc: null,
    isInitiator: false,
    scanInterval: null,
    stream: null
};

// DOM elements
const elements = {};

// Initialize DOM elements
function initElements() {
    const ids = [
        'status', 'start-btn', 'scan-btn', 'manual-btn', 'connect-btn', 
        'back-scan-btn', 'back-manual-btn', 'test-btn', 'disconnect-btn',
        'qr-container', 'video', 'manual-input', 'connection-info'
    ];
    
    ids.forEach(id => {
        elements[id] = document.getElementById(id);
        if (!elements[id]) {
            console.warn(`Element not found: ${id}`);
        }
    });
}

// Show step
function showStep(step) {
    console.log('Showing step:', step);
    state.step = step;
    
    // Hide all steps
    document.querySelectorAll('.step-view').forEach(el => {
        el.classList.add('hidden');
    });
    
    // Show current step
    const stepEl = document.getElementById(`step-${step}`);
    if (stepEl) {
        stepEl.classList.remove('hidden');
    }
}

// Update status
function updateStatus(message, type = 'info') {
    console.log('Status:', message, type);
    if (!elements.status) return;
    
    elements.status.textContent = message;
    elements.status.className = 'mb-4 p-3 rounded-lg text-center';
    
    if (type === 'error') {
        elements.status.classList.add('bg-red-50', 'text-red-800');
    } else if (type === 'success') {
        elements.status.classList.add('bg-green-50', 'text-green-800');
    } else {
        elements.status.classList.add('bg-blue-50', 'text-blue-800');
    }
}

// Generate QR code
function generateQR(data) {
    console.log('Generating QR for data length:', data.length);
    
    try {
        // Create QR code
        const qr = qrcode(0, 'M');
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
        
        // Add to container
        if (elements['qr-container']) {
            elements['qr-container'].innerHTML = '';
            elements['qr-container'].appendChild(canvas);
            
            // Also add copyable text area
            const textArea = document.createElement('textarea');
            textArea.value = data;
            textArea.className = 'w-full h-20 p-2 border border-gray-300 rounded mt-2 font-mono text-xs';
            textArea.readonly = true;
            textArea.onclick = () => textArea.select();
            elements['qr-container'].appendChild(textArea);
        }
        
        console.log('QR code generated successfully');
        
    } catch (error) {
        console.error('QR generation error:', error);
        updateStatus('QR generation failed - use manual entry', 'error');
    }
}

// Create WebRTC connection
async function createConnection() {
    console.log('Creating WebRTC connection...');
    
    try {
        state.pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        state.isInitiator = true;
        
        // Create data channel (only for initiator)
        state.dc = state.pc.createDataChannel('pair2peer', { ordered: true });
        setupDataChannel(state.dc);
        
        // Handle ICE candidates
        state.pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE candidate:', event.candidate);
            } else {
                console.log('ICE gathering complete');
                // Offer is complete, generate QR
                const offerData = {
                    type: 'offer',
                    sdp: state.pc.localDescription.sdp
                };
                generateQR(JSON.stringify(offerData));
                updateStatus('QR code generated - show to other device');
                showStep('qr');
            }
        };
        
        // Create offer
        const offer = await state.pc.createOffer();
        await state.pc.setLocalDescription(offer);
        
        console.log('Created offer, waiting for ICE candidates...');
        updateStatus('Creating connection info...');
        
    } catch (error) {
        console.error('Error creating connection:', error);
        updateStatus('Error creating connection: ' + error.message, 'error');
    }
}

// Setup data channel
function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('Data channel opened');
        updateStatus('Connection established!', 'success');
        
        if (elements['connection-info']) {
            elements['connection-info'].innerHTML = `
                Connection State: ${state.pc.connectionState}<br>
                Channel Ready: ${channel.readyState}<br>
                Role: ${state.isInitiator ? 'Initiator' : 'Responder'}
            `;
        }
        
        showStep('connected');
    };
    
    channel.onmessage = (event) => {
        console.log('Received message:', event.data);
        updateStatus('Received: ' + event.data, 'success');
    };
    
    channel.onclose = () => {
        console.log('Data channel closed');
        updateStatus('Data channel closed');
    };
    
    channel.onerror = (error) => {
        console.error('Data channel error:', error);
        updateStatus('Data channel error', 'error');
    };
}

// Handle connection data
async function handleConnectionData(data) {
    console.log('Handling connection data:', data);
    
    try {
        const message = JSON.parse(data);
        
        if (message.type === 'offer') {
            console.log('Received offer, creating answer...');
            
            if (!state.pc) {
                state.pc = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                
                // Handle incoming data channel
                state.pc.ondatachannel = (event) => {
                    console.log('Received data channel');
                    state.dc = event.channel;
                    setupDataChannel(state.dc);
                };
                
                // Handle ICE candidates
                state.pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('ICE candidate:', event.candidate);
                    } else {
                        console.log('ICE gathering complete for answer');
                        const answerData = {
                            type: 'answer',
                            sdp: state.pc.localDescription.sdp
                        };
                        
                        // Show the answer for them to copy back
                        const answerText = JSON.stringify(answerData);
                        if (elements['manual-input']) {
                            elements['manual-input'].value = answerText;
                        }
                        updateStatus('Answer created! Copy this back to the other device:', 'success');
                    }
                };
            }
            
            await state.pc.setRemoteDescription({
                type: 'offer',
                sdp: message.sdp
            });
            
            const answer = await state.pc.createAnswer();
            await state.pc.setLocalDescription(answer);
            
            updateStatus('Creating answer...');
            
        } else if (message.type === 'answer') {
            console.log('Received answer...');
            
            await state.pc.setRemoteDescription({
                type: 'answer',
                sdp: message.sdp
            });
            
            updateStatus('Answer received, establishing connection...', 'success');
        }
        
    } catch (error) {
        console.error('Error handling connection data:', error);
        updateStatus('Error processing connection data: ' + error.message, 'error');
    }
}

// Start camera
async function startCamera() {
    try {
        state.stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        
        if (elements.video) {
            elements.video.srcObject = state.stream;
            elements.video.onloadedmetadata = () => {
                console.log('Video metadata loaded, starting scan');
                startScanning();
            };
        }
        
        updateStatus('Camera started - point at QR code');
    } catch (error) {
        console.error('Camera error:', error);
        updateStatus('Camera access denied or not available', 'error');
    }
}

// Stop camera
function stopCamera() {
    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.stream = null;
    }
    if (elements.video) {
        elements.video.srcObject = null;
    }
}

// Start QR scanning
function startScanning() {
    if (state.scanInterval) return;
    
    state.scanInterval = setInterval(async () => {
        if (elements.video && elements.video.videoWidth > 0) {
            const result = await scanQRFromVideo(elements.video);
            if (result) {
                console.log('QR code scanned:', result);
                stopScanning();
                stopCamera();
                updateStatus('QR code detected, processing...');
                handleConnectionData(result);
            }
        }
    }, 500);
}

// Stop scanning
function stopScanning() {
    if (state.scanInterval) {
        clearInterval(state.scanInterval);
        state.scanInterval = null;
    }
}

// Scan QR from video
async function scanQRFromVideo(videoElement) {
    try {
        // Use dynamic import for jsQR
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

// Send test message
function sendTestMessage() {
    if (state.dc && state.dc.readyState === 'open') {
        const message = `Hello from ${state.isInitiator ? 'initiator' : 'responder'} at ${new Date().toLocaleTimeString()}`;
        state.dc.send(message);
        updateStatus('Sent: ' + message, 'success');
    } else {
        updateStatus('Data channel not ready', 'error');
    }
}

// Disconnect
function disconnect() {
    console.log('Disconnecting...');
    
    if (state.pc) {
        state.pc.close();
        state.pc = null;
        state.dc = null;
    }
    
    stopScanning();
    stopCamera();
    
    state.isInitiator = false;
    updateStatus('Disconnected');
    showStep('start');
}

// Event listeners
function attachEventListeners() {
    if (elements['start-btn']) {
        elements['start-btn'].addEventListener('click', () => {
            console.log('Start button clicked');
            updateStatus('Creating connection...');
            createConnection();
        });
    }
    
    if (elements['scan-btn']) {
        elements['scan-btn'].addEventListener('click', () => {
            console.log('Scan button clicked');
            updateStatus('Preparing to scan...');
            showStep('scan');
            startCamera();
        });
    }
    
    if (elements['manual-btn']) {
        elements['manual-btn'].addEventListener('click', () => {
            console.log('Manual button clicked');
            stopScanning();
            stopCamera();
            showStep('manual');
        });
    }
    
    if (elements['connect-btn']) {
        elements['connect-btn'].addEventListener('click', () => {
            console.log('Connect button clicked');
            const data = elements['manual-input'] ? elements['manual-input'].value.trim() : '';
            if (data) {
                updateStatus('Processing connection data...');
                handleConnectionData(data);
            } else {
                updateStatus('Please enter connection data', 'error');
            }
        });
    }
    
    if (elements['back-scan-btn']) {
        elements['back-scan-btn'].addEventListener('click', () => {
            console.log('Back scan button clicked');
            stopScanning();
            stopCamera();
            showStep('qr');
        });
    }
    
    if (elements['back-manual-btn']) {
        elements['back-manual-btn'].addEventListener('click', () => {
            console.log('Back manual button clicked');
            showStep('qr');
        });
    }
    
    if (elements['test-btn']) {
        elements['test-btn'].addEventListener('click', () => {
            console.log('Test button clicked');
            sendTestMessage();
        });
    }
    
    if (elements['disconnect-btn']) {
        elements['disconnect-btn'].addEventListener('click', () => {
            console.log('Disconnect button clicked');
            disconnect();
        });
    }
}

// Initialize app
function init() {
    console.log('Initializing Pair2Peer...');
    
    initElements();
    attachEventListeners();
    showStep('start');
    updateStatus('Ready to start pairing');
    
    console.log('Pair2Peer initialized successfully');
}

// Start the app
init();
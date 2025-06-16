import type { AppContext, AppState, DataChannelMessage, P2PQRHeader } from './types.js';
import { 
  createOfferPeer, 
  createAnswerPeer, 
  waitForDataChannel,
  extractTurnFromHeader,
  computeSdpFingerprint
} from './webrtc.js';
import {
  generatePairCode,
  createQRChunks,
  generateQRCanvas,
  scanQRFromCanvas,
  parseQRPayload,
  assembleChunks,
  setupCamera,
  stopCamera,
  checkTorchSupport,
  toggleTorch
} from './qr.js';

class PeerPairApp {
  private ctx: AppContext = {
    state: 'idle',
    pairCode: '',
    role: null,
    pc: null,
    dc: null,
    localSdp: null,
    remoteSdp: null,
    remoteFingerprint: null,
    qrChunks: [],
    scannedChunks: new Map(),
    candidateQueue: [],
    error: null
  };

  private elements: Record<string, HTMLElement> = {};
  private scanInterval: number | null = null;
  private verifyTimeout: number | null = null;
  private mediaStream: MediaStream | null = null;
  private torchEnabled = false;

  constructor() {
    this.initializeElements();
    this.attachEventListeners();
    this.setState('idle');
  }

  private initializeElements(): void {
    const ids = [
      'state-idle', 'state-gather', 'state-show-qr', 'state-scan',
      'state-manual', 'state-verify', 'state-connected',
      'start-pairing', 'scan-answer', 'manual-input', 'back-to-scan',
      'parse-manual', 'disconnect', 'error-banner', 'error-message',
      'error-retry', 'pair-code-display', 'qr-container',
      'scanner-video', 'scanner-canvas', 'manual-data',
      'connection-info', 'status-region', 'toggle-torch'
    ];

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) this.elements[id] = el;
    });
  }

  private attachEventListeners(): void {
    this.elements['start-pairing'].addEventListener('click', () => this.startPairing());
    this.elements['scan-answer'].addEventListener('click', () => this.setState('scan-answer-qr'));
    this.elements['manual-input'].addEventListener('click', () => this.setState('manual-paste'));
    this.elements['back-to-scan'].addEventListener('click', () => this.setState('scan-answer-qr'));
    this.elements['parse-manual'].addEventListener('click', () => this.parseManualData());
    this.elements['disconnect'].addEventListener('click', () => this.disconnect());
    this.elements['error-retry'].addEventListener('click', () => this.reset());
    this.elements['toggle-torch'].addEventListener('click', () => this.handleToggleTorch());
  }

  private setState(state: AppState): void {
    this.ctx.state = state;
    this.updateUI();
    this.updateStatus(`State: ${state}`);

    switch (state) {
      case 'gather-offer':
        this.gatherOffer();
        break;
      case 'scan-answer-qr':
        this.startScanning();
        break;
      case 'manual-paste':
        (this.elements['manual-data'] as HTMLTextAreaElement).value = '';
        break;
    }
  }

  private updateUI(): void {
    const stateElements = [
      'state-idle', 'state-gather', 'state-show-qr', 'state-scan',
      'state-manual', 'state-verify', 'state-connected'
    ];

    stateElements.forEach(id => {
      const el = this.elements[id];
      if (el) {
        el.classList.toggle('hidden', !id.includes(this.ctx.state));
      }
    });

    if (this.ctx.error) {
      this.elements['error-banner'].classList.remove('hidden');
      this.elements['error-message'].textContent = this.ctx.error;
    } else {
      this.elements['error-banner'].classList.add('hidden');
    }
  }

  private updateStatus(message: string): void {
    this.elements['status-region'].textContent = message;
  }

  private async startPairing(): Promise<void> {
    this.ctx.role = 'offer';
    this.ctx.pairCode = generatePairCode();
    this.setState('gather-offer');
  }

  private async gatherOffer(): Promise<void> {
    try {
      const { pc, dc, localSdp } = await createOfferPeer();
      this.ctx.pc = pc;
      this.ctx.dc = dc;
      this.ctx.localSdp = localSdp.sdp!;

      this.setupDataChannel();
      
      const header: Omit<P2PQRHeader, 'seq' | 'total'> = {
        magic: 'P2PQR',
        v: 1,
        role: 'offer',
        pairCode: this.ctx.pairCode,
        caps: ['v1']
      };

      this.ctx.qrChunks = await createQRChunks(header, this.ctx.localSdp);
      this.showOfferQR();
    } catch (err) {
      this.showError('Failed to create offer: ' + (err as Error).message);
    }
  }

  private async showOfferQR(): Promise<void> {
    this.setState('show-offer-qr');
    this.elements['pair-code-display'].textContent = this.ctx.pairCode;
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(`Pair code: ${this.ctx.pairCode.split('').join(' ')}`);
      speechSynthesis.speak(utterance);
    }

    const container = this.elements['qr-container'];
    container.innerHTML = '';

    for (const chunk of this.ctx.qrChunks) {
      const canvas = await generateQRCanvas(chunk);
      container.appendChild(canvas);
    }
  }

  private async startScanning(): Promise<void> {
    try {
      const video = this.elements['scanner-video'] as HTMLVideoElement;
      this.mediaStream = await setupCamera(video, 'environment');
      
      const hasTorch = await checkTorchSupport(this.mediaStream);
      this.elements['toggle-torch'].classList.toggle('hidden', !hasTorch);

      this.scanInterval = window.setInterval(() => this.performScan(), 200);
      
      setTimeout(() => {
        if (this.ctx.state === 'scan-answer-qr' && this.ctx.scannedChunks.size === 0) {
          this.updateStatus('No QR detected. Try adjusting lighting or distance.');
        }
      }, 30000);
    } catch (err) {
      this.showError('Camera access denied. Use Copy/Paste instead.');
      this.setState('manual-paste');
    }
  }

  private performScan(): void {
    const video = this.elements['scanner-video'] as HTMLVideoElement;
    const canvas = this.elements['scanner-canvas'] as HTMLCanvasElement;
    
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    const data = scanQRFromCanvas(canvas, video);
    if (!data) return;

    const header = parseQRPayload(data);
    if (!header || header.role !== 'answer') return;

    const chunk = { ...header };
    this.ctx.scannedChunks.set(header.seq, data);

    const assembled = assembleChunks(
      new Map(Array.from(this.ctx.scannedChunks.entries()).map(([k, v]) => {
        const h = parseQRPayload(v);
        return h ? [k, h] : [k, {} as P2PQRHeader];
      }))
    );

    if (assembled.complete && assembled.header) {
      this.processAnswerData(assembled.header);
    }
  }

  private parseManualData(): void {
    const textarea = this.elements['manual-data'] as HTMLTextAreaElement;
    const data = textarea.value.trim();
    
    try {
      const header = parseQRPayload(data);
      if (!header || header.role !== 'answer') {
        throw new Error('Invalid P2PQR data');
      }
      this.processAnswerData(header);
    } catch (err) {
      this.showError('Invalid data format. Please paste the exact P2PQR data.');
    }
  }

  private async processAnswerData(header: P2PQRHeader): Promise<void> {
    if (header.pairCode !== this.ctx.pairCode) {
      this.showError('Pair code mismatch. Ensure you\'re scanning the correct QR.');
      return;
    }

    this.stopScanning();
    this.ctx.remoteSdp = header.sdp!;
    
    const turn = extractTurnFromHeader(header);
    if (turn.length > 0 && this.ctx.pc) {
      const config = this.ctx.pc.getConfiguration();
      config.iceServers = [...(config.iceServers || []), ...turn];
      this.ctx.pc.setConfiguration(config);
    }

    try {
      await this.ctx.pc!.setRemoteDescription({
        type: 'answer',
        sdp: this.ctx.remoteSdp
      });
      
      this.setState('verify');
      this.performVerification();
    } catch (err) {
      this.showError('Failed to process answer: ' + (err as Error).message);
    }
  }

  private setupDataChannel(): void {
    if (!this.ctx.dc) return;

    this.ctx.dc.onopen = () => {
      if (this.ctx.state === 'verify') {
        this.performVerification();
      }
    };

    this.ctx.dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as DataChannelMessage;
        this.handleDataChannelMessage(msg);
      } catch (err) {
        console.error('Invalid message:', err);
      }
    };

    this.ctx.dc.onerror = () => {
      this.showError('Data channel error');
    };
  }

  private async performVerification(): Promise<void> {
    if (!this.ctx.dc || this.ctx.dc.readyState !== 'open') {
      await waitForDataChannel(this.ctx.dc!);
    }

    const fingerprint = await computeSdpFingerprint(this.ctx.remoteSdp!);
    
    const hello: DataChannelMessage = {
      type: 'hello',
      pairCode: this.ctx.pairCode,
      fingerprint,
      caps: ['v1']
    };

    this.ctx.dc!.send(JSON.stringify(hello));

    this.verifyTimeout = window.setTimeout(() => {
      this.showError('Verification timeout. Connection may be blocked.');
    }, 20000);
  }

  private handleDataChannelMessage(msg: DataChannelMessage): void {
    switch (msg.type) {
      case 'hello':
        this.handleHello(msg);
        break;
      case 'ack':
        this.handleAck();
        break;
      case 'trickle':
        this.handleTrickle(msg);
        break;
    }
  }

  private async handleHello(msg: DataChannelMessage): Promise<void> {
    if (msg.type !== 'hello') return;

    if (msg.pairCode !== this.ctx.pairCode) {
      this.ctx.dc!.close();
      this.showError('Pair code mismatch in verification');
      return;
    }

    const expectedFingerprint = await computeSdpFingerprint(this.ctx.localSdp!);
    if (msg.fingerprint !== expectedFingerprint) {
      this.ctx.dc!.close();
      this.showError('Fingerprint mismatch. Possible MITM attack.');
      return;
    }

    this.ctx.remoteFingerprint = msg.fingerprint;
    
    const ack: AckMessage = { type: 'ack' };
    this.ctx.dc!.send(JSON.stringify(ack));
    
    this.handleAck();
  }

  private handleAck(): void {
    if (this.verifyTimeout) {
      clearTimeout(this.verifyTimeout);
      this.verifyTimeout = null;
    }

    this.setState('connected');
    
    const lastFp = localStorage.getItem('lastFp');
    const fpMatch = lastFp === this.ctx.remoteFingerprint;
    
    this.elements['connection-info'].textContent = 
      `Fingerprint: ${this.ctx.remoteFingerprint?.substring(0, 16)}...${fpMatch ? ' ✓' : ''}`;
    
    localStorage.setItem('lastFp', this.ctx.remoteFingerprint!);

    if (this.ctx.candidateQueue.length > 0) {
      const trickle: TrickleMessage = {
        type: 'trickle',
        candidates: this.ctx.candidateQueue
      };
      this.ctx.dc!.send(JSON.stringify(trickle));
      this.ctx.candidateQueue = [];
    }
  }

  private async handleTrickle(msg: TrickleMessage): Promise<void> {
    for (const candidate of msg.candidates) {
      try {
        await this.ctx.pc!.addIceCandidate(candidate);
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    }
  }

  private async handleToggleTorch(): Promise<void> {
    if (!this.mediaStream) return;
    this.torchEnabled = !this.torchEnabled;
    await toggleTorch(this.mediaStream, this.torchEnabled);
  }

  private stopScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    if (this.mediaStream) {
      stopCamera(this.mediaStream);
      this.mediaStream = null;
    }
  }

  private showError(message: string): void {
    this.ctx.error = message;
    this.updateUI();
  }

  private disconnect(): void {
    this.ctx.dc?.close();
    this.ctx.pc?.close();
    this.reset();
  }

  private reset(): void {
    this.stopScanning();
    
    if (this.verifyTimeout) {
      clearTimeout(this.verifyTimeout);
      this.verifyTimeout = null;
    }

    this.ctx = {
      state: 'idle',
      pairCode: '',
      role: null,
      pc: null,
      dc: null,
      localSdp: null,
      remoteSdp: null,
      remoteFingerprint: null,
      qrChunks: [],
      scannedChunks: new Map(),
      candidateQueue: [],
      error: null
    };

    this.setState('idle');
  }
}

new PeerPairApp();
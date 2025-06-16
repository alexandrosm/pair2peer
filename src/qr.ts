import QRCode from 'qrcode';
import jsQR from 'jsqr';
import type { P2PQRHeader } from './types.js';

const MAX_QR_SIZE = 2000;
const QR_ERROR_CORRECTION = 'M';

export function generatePairCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function createQRChunks(
  header: Omit<P2PQRHeader, 'seq' | 'total'>,
  sdp: string
): Promise<string[]> {
  const baseHeader: P2PQRHeader = {
    ...header,
    seq: 1,
    total: 1,
    sdp
  };
  
  const fullPayload = btoa(JSON.stringify(baseHeader));
  
  if (fullPayload.length <= MAX_QR_SIZE) {
    return [fullPayload];
  }
  
  const chunks: string[] = [];
  const chunkSize = MAX_QR_SIZE - 200;
  const totalChunks = Math.ceil(sdp.length / chunkSize);
  
  for (let i = 0; i < totalChunks; i++) {
    const sdpChunk = sdp.slice(i * chunkSize, (i + 1) * chunkSize);
    const chunkHeader: P2PQRHeader = {
      ...header,
      seq: i + 1,
      total: totalChunks,
      sdp: i === 0 ? sdpChunk : undefined
    };
    
    chunks.push(btoa(JSON.stringify(chunkHeader)));
  }
  
  return chunks;
}

export async function generateQRCanvas(data: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, data, {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: 2,
    width: 300,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
  return canvas;
}

export function scanQRFromCanvas(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
): string | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert'
  });
  
  return code?.data || null;
}

export function parseQRPayload(data: string): P2PQRHeader | null {
  try {
    const json = atob(data);
    const header = JSON.parse(json) as P2PQRHeader;
    
    if (header.magic !== 'P2PQR' || header.v !== 1) {
      return null;
    }
    
    return header;
  } catch {
    return null;
  }
}

export function assembleChunks(
  chunks: Map<number, P2PQRHeader>
): { complete: boolean; sdp?: string; header?: P2PQRHeader } {
  if (chunks.size === 0) {
    return { complete: false };
  }
  
  const firstChunk = chunks.get(1);
  if (!firstChunk) {
    return { complete: false };
  }
  
  const { total } = firstChunk;
  
  if (chunks.size < total) {
    return { complete: false };
  }
  
  let fullSdp = '';
  for (let i = 1; i <= total; i++) {
    const chunk = chunks.get(i);
    if (!chunk || (i > 1 && !chunk.sdp)) {
      return { complete: false };
    }
    if (chunk.sdp) {
      fullSdp += chunk.sdp;
    }
  }
  
  return {
    complete: true,
    sdp: fullSdp,
    header: { ...firstChunk, sdp: fullSdp }
  };
}

export async function setupCamera(
  video: HTMLVideoElement,
  facingMode: 'user' | 'environment' = 'user'
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });
  
  video.srcObject = stream;
  await video.play();
  
  return stream;
}

export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

export async function checkTorchSupport(stream: MediaStream): Promise<boolean> {
  const track = stream.getVideoTracks()[0];
  if (!track || !('getCapabilities' in track)) {
    return false;
  }
  
  const capabilities = track.getCapabilities() as any;
  return capabilities?.torch === true;
}

export async function toggleTorch(stream: MediaStream, enabled: boolean): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  
  await track.applyConstraints({
    advanced: [{ torch: enabled } as any]
  });
}
export interface P2PQRHeader {
  magic: 'P2PQR';
  v: number;
  role: 'offer' | 'answer';
  seq: number;
  total: number;
  pairCode: string;
  caps?: string[];
  sdp?: string;
  turn?: RTCIceServer;
}

export interface VerificationMessage {
  type: 'hello';
  pairCode: string;
  fingerprint: string;
  caps?: string[];
}

export interface AckMessage {
  type: 'ack';
}

export interface TrickleMessage {
  type: 'trickle';
  candidates: RTCIceCandidateInit[];
}

export type DataChannelMessage = VerificationMessage | AckMessage | TrickleMessage;

export type AppState = 
  | 'idle'
  | 'gather-offer'
  | 'show-offer-qr'
  | 'scan-answer-qr'
  | 'manual-paste'
  | 'verify'
  | 'connected'
  | 'error';

export interface AppContext {
  state: AppState;
  pairCode: string;
  role: 'offer' | 'answer' | null;
  pc: RTCPeerConnection | null;
  dc: RTCDataChannel | null;
  localSdp: string | null;
  remoteSdp: string | null;
  remoteFingerprint: string | null;
  qrChunks: string[];
  scannedChunks: Map<number, string>;
  candidateQueue: RTCIceCandidateInit[];
  error: string | null;
}
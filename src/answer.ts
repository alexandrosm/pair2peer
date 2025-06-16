import type { P2PQRHeader } from './types.js';
import { createAnswerPeer, computeSdpFingerprint } from './webrtc.js';
import { createQRChunks } from './qr.js';

export async function createAnswerFlow(
  offerHeader: P2PQRHeader,
  iceServers: RTCIceServer[] = []
): Promise<{
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  qrChunks: string[];
}> {
  const { pc, dc, localSdp } = await createAnswerPeer(offerHeader.sdp!, iceServers);
  
  const answerHeader: Omit<P2PQRHeader, 'seq' | 'total'> = {
    magic: 'P2PQR',
    v: 1,
    role: 'answer',
    pairCode: offerHeader.pairCode,
    caps: offerHeader.caps,
    turn: offerHeader.turn
  };
  
  const qrChunks = await createQRChunks(answerHeader, localSdp.sdp!);
  
  return { pc, dc, qrChunks };
}
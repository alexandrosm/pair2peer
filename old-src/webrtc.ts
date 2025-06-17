import type { P2PQRHeader } from './types.js';

export async function createOfferPeer(iceServers: RTCIceServer[] = []): Promise<{
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  localSdp: RTCSessionDescriptionInit;
}> {
  const pc = new RTCPeerConnection({ iceServers });
  const dc = pc.createDataChannel('data', {
    ordered: true,
    maxRetransmits: 3
  });
  
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  await waitForIceGathering(pc);
  
  return {
    pc,
    dc,
    localSdp: pc.localDescription!
  };
}

export async function createAnswerPeer(
  offerSdp: string,
  iceServers: RTCIceServer[] = []
): Promise<{
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  localSdp: RTCSessionDescriptionInit;
}> {
  const pc = new RTCPeerConnection({ iceServers });
  
  let dcResolve: (dc: RTCDataChannel) => void;
  const dcPromise = new Promise<RTCDataChannel>((resolve) => {
    dcResolve = resolve;
  });
  
  pc.ondatachannel = (event) => {
    dcResolve(event.channel);
  };
  
  await pc.setRemoteDescription({
    type: 'offer',
    sdp: offerSdp
  });
  
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  
  await waitForIceGathering(pc);
  
  const dc = await dcPromise;
  
  return {
    pc,
    dc,
    localSdp: pc.localDescription!
  };
}

export async function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return;
  }
  
  return new Promise((resolve) => {
    const checkState = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', checkState);
  });
}

export async function waitForConnection(
  pc: RTCPeerConnection,
  timeout: number = 20000
): Promise<void> {
  if (pc.connectionState === 'connected') {
    return;
  }
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pc.removeEventListener('connectionstatechange', onStateChange);
      reject(new Error('Connection timeout'));
    }, timeout);
    
    const onStateChange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(timer);
        pc.removeEventListener('connectionstatechange', onStateChange);
        resolve();
      } else if (pc.connectionState === 'failed') {
        clearTimeout(timer);
        pc.removeEventListener('connectionstatechange', onStateChange);
        reject(new Error('Connection failed'));
      }
    };
    
    pc.addEventListener('connectionstatechange', onStateChange);
  });
}

export async function waitForDataChannel(
  dc: RTCDataChannel,
  timeout: number = 20000
): Promise<void> {
  if (dc.readyState === 'open') {
    return;
  }
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      dc.removeEventListener('open', onOpen);
      dc.removeEventListener('error', onError);
      reject(new Error('Data channel timeout'));
    }, timeout);
    
    const onOpen = () => {
      clearTimeout(timer);
      dc.removeEventListener('open', onOpen);
      dc.removeEventListener('error', onError);
      resolve();
    };
    
    const onError = () => {
      clearTimeout(timer);
      dc.removeEventListener('open', onOpen);
      dc.removeEventListener('error', onError);
      reject(new Error('Data channel error'));
    };
    
    dc.addEventListener('open', onOpen);
    dc.addEventListener('error', onError);
  });
}

export function extractTurnFromHeader(header: P2PQRHeader): RTCIceServer[] {
  if (!header.turn) {
    return [];
  }
  return [header.turn];
}

export async function computeSdpFingerprint(sdp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(sdp);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
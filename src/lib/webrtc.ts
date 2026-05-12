import { db } from './firebase';
import {
  doc, collection, addDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export class WebRTCCall {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private localRecorder: MediaRecorder | null = null;
  private remoteRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private localChunks: Blob[] = [];
  private remoteChunks: Blob[] = [];
  private callId: string;
  private userId: string;
  private unsubSignaling: (() => void) | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private hasRemoteDescription = false;
  private audioContext: AudioContext | null = null;
  private mixedStream: MediaStream | null = null;

  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onConnectionState: ((state: RTCPeerConnectionState) => void) | null = null;

  constructor(callId: string, userId: string) {
    this.callId = callId;
    this.userId = userId;
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        const sigRef = collection(db, 'calls', callId, 'signaling');
        addDoc(sigRef, {
          type: 'ice-candidate',
          from: userId,
          sdp: null,
          candidate: {
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
          },
          createdAt: serverTimestamp(),
        });
      }
    };

    this.pc.ontrack = (e) => {
      if (e.streams[0]) {
        this.remoteStream = e.streams[0];
        this.onRemoteStream?.(e.streams[0]);
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.pc.connectionState);
      this.onConnectionState?.(this.pc.connectionState);
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', this.pc.iceConnectionState);
      if (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed') {
        this.onConnectionState?.('connected');
      }
    };
  }

  async start(): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream!));
    this.listenSignaling();
    return this.localStream;
  }

  async createOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    const sigRef = collection(db, 'calls', this.callId, 'signaling');
    await addDoc(sigRef, {
      type: 'offer',
      from: this.userId,
      sdp: offer.sdp,
      candidate: null,
      createdAt: serverTimestamp(),
    });
    console.log('[WebRTC] Offer sent');
  }

  private async addBufferedCandidates() {
    for (const candidate of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] Failed to add buffered candidate:', e);
      }
    }
    this.pendingCandidates = [];
  }

  private listenSignaling() {
    const sigRef = collection(db, 'calls', this.callId, 'signaling');

    this.unsubSignaling = onSnapshot(sigRef, (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data();
        if (data.from === this.userId) return;

        console.log('[WebRTC] Received signaling:', data.type);

        if (data.type === 'offer' && data.sdp) {
          await this.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          this.hasRemoteDescription = true;
          await this.addBufferedCandidates();
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          await addDoc(sigRef, {
            type: 'answer',
            from: this.userId,
            sdp: answer.sdp,
            candidate: null,
            createdAt: serverTimestamp(),
          });
          console.log('[WebRTC] Answer sent');
        } else if (data.type === 'answer' && data.sdp) {
          await this.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          this.hasRemoteDescription = true;
          await this.addBufferedCandidates();
          console.log('[WebRTC] Answer received');
        } else if (data.type === 'ice-candidate' && data.candidate) {
          if (this.hasRemoteDescription) {
            try {
              await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.warn('[WebRTC] Failed to add candidate:', e);
            }
          } else {
            this.pendingCandidates.push(data.candidate);
          }
        }
      });
    });
  }

  private createRecorder(stream: MediaStream, chunks: Blob[]): MediaRecorder | null {
    const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', ''];
    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (!mime || MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }
    try {
      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      return recorder;
    } catch (e) {
      console.error('[WebRTC] MediaRecorder creation failed:', e);
      return null;
    }
  }

  startRecording() {
    if (!this.localStream) {
      console.warn('[WebRTC] No local stream, cannot record');
      return;
    }

    this.localChunks = [];
    this.remoteChunks = [];

    // Record local (user's mic) separately
    this.localRecorder = this.createRecorder(this.localStream, this.localChunks);
    if (this.localRecorder) {
      this.localRecorder.start(1000);
      console.log('[WebRTC] Local recording started');
    }

    // Record remote (partner's audio) separately
    if (this.remoteStream) {
      this.remoteRecorder = this.createRecorder(this.remoteStream, this.remoteChunks);
      if (this.remoteRecorder) {
        this.remoteRecorder.start(1000);
        console.log('[WebRTC] Remote recording started');
      }
    } else {
      console.log('[WebRTC] No remote stream yet, will record local only');
    }
  }

  stopRecording(): { local: Blob | null; remote: Blob | null } {
    let localBlob: Blob | null = null;
    let remoteBlob: Blob | null = null;

    if (this.localRecorder && this.localRecorder.state !== 'inactive') {
      this.localRecorder.stop();
    }
    if (this.remoteRecorder && this.remoteRecorder.state !== 'inactive') {
      this.remoteRecorder.stop();
    }

    if (this.localChunks.length > 0) {
      const mime = this.localRecorder?.mimeType || 'audio/webm';
      localBlob = new Blob(this.localChunks, { type: mime });
      console.log('[WebRTC] Local recording:', localBlob.size, 'bytes');
    }
    if (this.remoteChunks.length > 0) {
      const mime = this.remoteRecorder?.mimeType || 'audio/webm';
      remoteBlob = new Blob(this.remoteChunks, { type: mime });
      console.log('[WebRTC] Remote recording:', remoteBlob.size, 'bytes');
    }

    return { local: localBlob, remote: remoteBlob };
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const track = this.localStream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      return !track.enabled;
    }
    return false;
  }

  async cleanup() {
    this.unsubSignaling?.();
    this.localStream?.getTracks().forEach(t => t.stop());
    this.pc.close();
  }
}

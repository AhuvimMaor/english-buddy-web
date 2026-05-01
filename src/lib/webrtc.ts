import { db } from './firebase';
import {
  doc, collection, addDoc, onSnapshot, updateDoc, serverTimestamp,
  query, orderBy, getDocs, writeBatch,
} from 'firebase/firestore';
import { IceCandidateData, SignalingMessage } from '@/types';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
  ],
};

export class WebRTCCall {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private callId: string;
  private userId: string;
  private unsubSignaling: (() => void) | null = null;

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
      if (e.streams[0] && this.onRemoteStream) {
        this.onRemoteStream(e.streams[0]);
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.onConnectionState?.(this.pc.connectionState);
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
  }

  private listenSignaling() {
    const sigRef = collection(db, 'calls', this.callId, 'signaling');
    const q = query(sigRef, orderBy('createdAt', 'asc'));

    this.unsubSignaling = onSnapshot(q, (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data();
        if (data.from === this.userId) return;

        if (data.type === 'offer' && data.sdp) {
          await this.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          await addDoc(sigRef, {
            type: 'answer',
            from: this.userId,
            sdp: answer.sdp,
            candidate: null,
            createdAt: serverTimestamp(),
          });
        } else if (data.type === 'answer' && data.sdp) {
          await this.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        } else if (data.type === 'ice-candidate' && data.candidate) {
          await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      });
    });
  }

  startRecording() {
    if (!this.localStream) return;

    this.chunks = [];
    this.recorder = new MediaRecorder(this.localStream, { mimeType: 'audio/webm;codecs=opus' });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
  }

  stopRecording(): Blob | null {
    if (!this.recorder) return null;
    this.recorder.stop();
    return new Blob(this.chunks, { type: 'audio/webm' });
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

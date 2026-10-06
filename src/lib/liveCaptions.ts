import { extFromMime } from './recording';

// Streams short, self-contained audio segments of the user's own mic to
// /api/live-caption while a call is running. Segments are cut every few seconds
// (each is its own MediaRecorder, so every file is independently decodable) and
// silent ones are never sent, which keeps cost and phantom captions down.

const DEFAULT_SEGMENT_MS = 6000;
const SILENCE_RMS = 0.015; // 0..1; below this the segment is treated as silence
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export interface LiveCaptionerOptions {
  stream: MediaStream;
  callId: string;
  getToken: () => Promise<string>;
  segmentMs?: number;
  endpoint?: string;
}

export class LiveCaptioner {
  private opts: Required<Omit<LiveCaptionerOptions, 'stream'>> & { stream: MediaStream };
  private running = false;
  private seq = 0;
  private recorder: MediaRecorder | null = null;
  private segmentTimer: ReturnType<typeof setTimeout> | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private peakRms = 0;

  constructor(opts: LiveCaptionerOptions) {
    this.opts = {
      segmentMs: DEFAULT_SEGMENT_MS,
      endpoint: '/api/live-caption',
      ...opts,
    };
  }

  static isSupported(): boolean {
    return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
  }

  start() {
    if (this.running || !LiveCaptioner.isSupported()) return;
    this.running = true;
    this.setupLevelMeter();
    this.beginSegment();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.segmentTimer) clearTimeout(this.segmentTimer);
    if (this.levelTimer) clearInterval(this.levelTimer);
    // Ending the recorder flushes the last segment through its stop handler.
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.analyser = null;
  }

  private setupLevelMeter() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.audioContext = new Ctx();
      const source = this.audioContext.createMediaStreamSource(this.opts.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      source.connect(this.analyser);
      const data = new Uint8Array(this.analyser.fftSize);
      this.levelTimer = setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) {
          const centered = (v - 128) / 128;
          sum += centered * centered;
        }
        this.peakRms = Math.max(this.peakRms, Math.sqrt(sum / data.length));
      }, 100);
    } catch {
      this.analyser = null; // no meter: every segment is sent
    }
  }

  private pickMime(): string | undefined {
    return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
  }

  private beginSegment() {
    if (!this.running) return;
    const chunks: Blob[] = [];
    this.peakRms = 0;

    let recorder: MediaRecorder;
    try {
      const mimeType = this.pickMime();
      recorder = mimeType ? new MediaRecorder(this.opts.stream, { mimeType }) : new MediaRecorder(this.opts.stream);
    } catch (err) {
      console.warn('[LiveCaptions] cannot record:', err);
      this.running = false;
      return;
    }
    this.recorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const loud = !this.analyser || this.peakRms >= SILENCE_RMS;
      if (loud && chunks.length > 0) {
        void this.upload(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      }
      this.beginSegment();
    };

    recorder.start();
    this.segmentTimer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, this.opts.segmentMs);
  }

  private async upload(blob: Blob) {
    const seq = this.seq++;
    try {
      const token = await this.opts.getToken();
      const form = new FormData();
      form.append('callId', this.opts.callId);
      form.append('seq', String(seq));
      form.append('audio', blob, `segment-${seq}.${extFromMime(blob.type)}`);
      const res = await fetch(this.opts.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        keepalive: false,
      });
      if (!res.ok) console.warn('[LiveCaptions] segment rejected:', res.status);
    } catch (err) {
      // Live captions are best-effort: a dropped segment must never affect the call.
      console.warn('[LiveCaptions] segment upload failed:', err);
    }
  }
}

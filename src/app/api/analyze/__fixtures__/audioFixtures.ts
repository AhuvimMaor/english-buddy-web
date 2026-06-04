// Pure helpers for the recorded-conversation e2e tests. No firebase/openai deps.

// Split a buffer into `parts` contiguous slices. Concatenating the slices back
// in order reproduces the original buffer exactly — which is the whole point:
// it lets a real recording stand in for the per-15s MediaRecorder slices and
// proves loadChunked's getFiles+Buffer.concat reverses the split byte-for-byte.
export function sliceBuffer(buf: Buffer, parts: number): Buffer[] {
  if (parts <= 1) return [buf];
  const size = Math.ceil(buf.length / parts);
  const out: Buffer[] = [];
  for (let i = 0; i < buf.length; i += size) {
    out.push(buf.subarray(i, i + size));
  }
  return out;
}

// Deterministic synthetic "audio" bytes for the mocked test (Whisper is stubbed
// there, so the content only needs to be distinct and reproducible).
export function makeFakeAudio(label: string, bytes = 5000): Buffer {
  const out = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) {
    out[i] = (label.charCodeAt(i % label.length) + i) % 256;
  }
  return out;
}

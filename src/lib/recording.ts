// Pure recording helpers shared by the call client and the analyze server route.
// IMPORTANT: keep this module free of firebase / MediaRecorder / browser deps so it
// stays trivially unit-testable on both client and server.

export const CHUNK_TIMESLICE_MS = 15_000; // 15s per uploaded slice
export const CHUNK_INDEX_PAD = 6; // zero-pad width -> "000003"
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // OpenAI Whisper hard file limit

// Derive a file extension from a MediaRecorder mime string.
// Mirrors the historical logic in call/page.tsx (mp4 vs webm) and adds ogg.
export function extFromMime(mime?: string | null): string {
  if (!mime) return 'webm';
  const m = mime.toLowerCase();
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('ogg')) return 'ogg';
  return 'webm';
}

// Folder-like prefix that groups one speaker's chunks for a call.
// NOTE: object storage has no real folders; this is just a key prefix.
export function chunkPrefix(callId: string, uid: string): string {
  return `recordings/${callId}/${uid}`;
}

// Full object path for a single chunk with a zero-padded, sortable index.
//   chunkObjectPath('c1', 'u1', 3, 'webm') -> 'recordings/c1/u1/chunk-000003.webm'
export function chunkObjectPath(callId: string, uid: string, index: number, ext: string): string {
  const padded = String(index).padStart(CHUNK_INDEX_PAD, '0');
  return `${chunkPrefix(callId, uid)}/chunk-${padded}.${ext}`;
}

// Extract the numeric index from a chunk object name (full path or basename),
// or null if it is not a chunk file.
export function parseChunkIndex(name: string): number | null {
  const match = name.match(/chunk-(\d+)\.[a-z0-9]+$/i);
  return match ? parseInt(match[1], 10) : null;
}

// Keep only chunk-* files and return them sorted ascending by numeric index.
// Robust to mixed extensions, stray non-chunk files, and arbitrary input order.
export function sortChunkFilesByIndex(names: string[]): string[] {
  return names
    .map((name) => ({ name, index: parseChunkIndex(name) }))
    .filter((entry): entry is { name: string; index: number } => entry.index !== null)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.name);
}

export type ResolvedRecording =
  | { kind: 'chunked'; prefix: string; count: number; mime: string }
  | { kind: 'single'; path: string }
  | { kind: 'none' };

// Resolve how a given speaker's recording is stored on a call document.
// Precedence (backward compatible):
//   1. chunked  -> recordingChunkPrefix_${uid} present (new flow)
//   2. single   -> recording_${uid} (current per-speaker single file)
//   3. single   -> legacyFallback (role-specific: caller=recordingPath, callee=partnerRecordingPath)
//   4. none
export function resolveRecording(
  callData: Record<string, unknown>,
  uid: string,
  legacyFallback?: string | null
): ResolvedRecording {
  const prefix = callData[`recordingChunkPrefix_${uid}`];
  if (typeof prefix === 'string' && prefix.length > 0) {
    const count = callData[`recordingChunkCount_${uid}`];
    const mime = callData[`recordingMime_${uid}`];
    return {
      kind: 'chunked',
      prefix,
      count: typeof count === 'number' ? count : 0,
      mime: typeof mime === 'string' ? mime : 'audio/webm',
    };
  }

  const single = callData[`recording_${uid}`];
  if (typeof single === 'string' && single.length > 0) {
    return { kind: 'single', path: single };
  }

  if (typeof legacyFallback === 'string' && legacyFallback.length > 0) {
    return { kind: 'single', path: legacyFallback };
  }

  return { kind: 'none' };
}

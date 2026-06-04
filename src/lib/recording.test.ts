import { describe, it, expect } from 'vitest';
import {
  CHUNK_TIMESLICE_MS,
  WHISPER_MAX_BYTES,
  extFromMime,
  chunkPrefix,
  chunkObjectPath,
  parseChunkIndex,
  sortChunkFilesByIndex,
  resolveRecording,
} from './recording';

describe('constants', () => {
  it('uses a 15s timeslice', () => {
    expect(CHUNK_TIMESLICE_MS).toBe(15_000);
  });
  it('matches the Whisper 25MB limit', () => {
    expect(WHISPER_MAX_BYTES).toBe(26214400);
  });
});

describe('extFromMime', () => {
  it('maps webm/opus to webm', () => {
    expect(extFromMime('audio/webm;codecs=opus')).toBe('webm');
  });
  it('maps mp4 to mp4', () => {
    expect(extFromMime('audio/mp4')).toBe('mp4');
  });
  it('maps ogg to ogg', () => {
    expect(extFromMime('audio/ogg;codecs=opus')).toBe('ogg');
  });
  it('defaults to webm for empty/undefined/null', () => {
    expect(extFromMime('')).toBe('webm');
    expect(extFromMime(undefined)).toBe('webm');
    expect(extFromMime(null)).toBe('webm');
  });
});

describe('chunkPrefix / chunkObjectPath', () => {
  it('builds the prefix', () => {
    expect(chunkPrefix('call1', 'user1')).toBe('recordings/call1/user1');
  });
  it('zero-pads the index', () => {
    expect(chunkObjectPath('call1', 'user1', 3, 'webm')).toBe(
      'recordings/call1/user1/chunk-000003.webm'
    );
  });
  it('handles index 0 and large indices without overflowing pad width', () => {
    expect(chunkObjectPath('c', 'u', 0, 'mp4')).toBe('recordings/c/u/chunk-000000.mp4');
    expect(chunkObjectPath('c', 'u', 1234567, 'webm')).toBe('recordings/c/u/chunk-1234567.webm');
  });
});

describe('parseChunkIndex', () => {
  it('parses a chunk file index from a full path', () => {
    expect(parseChunkIndex('recordings/c/u/chunk-000042.webm')).toBe(42);
  });
  it('parses a basename', () => {
    expect(parseChunkIndex('chunk-000007.mp4')).toBe(7);
  });
  it('returns null for non-chunk files', () => {
    expect(parseChunkIndex('recordings/c/u1.webm')).toBeNull();
    expect(parseChunkIndex('random.txt')).toBeNull();
  });
});

describe('sortChunkFilesByIndex', () => {
  it('sorts shuffled chunk files ascending by index', () => {
    const input = [
      'recordings/c/u/chunk-000010.webm',
      'recordings/c/u/chunk-000002.webm',
      'recordings/c/u/chunk-000001.webm',
    ];
    expect(sortChunkFilesByIndex(input)).toEqual([
      'recordings/c/u/chunk-000001.webm',
      'recordings/c/u/chunk-000002.webm',
      'recordings/c/u/chunk-000010.webm',
    ]);
  });
  it('filters out stray non-chunk files', () => {
    const input = [
      'recordings/c/u/chunk-000001.webm',
      'recordings/c/u/notes.txt',
      'recordings/c/u1.webm',
    ];
    expect(sortChunkFilesByIndex(input)).toEqual(['recordings/c/u/chunk-000001.webm']);
  });
  it('handles mixed extensions', () => {
    const input = ['recordings/c/u/chunk-000002.mp4', 'recordings/c/u/chunk-000001.webm'];
    expect(sortChunkFilesByIndex(input)).toEqual([
      'recordings/c/u/chunk-000001.webm',
      'recordings/c/u/chunk-000002.mp4',
    ]);
  });
  it('returns empty for empty input', () => {
    expect(sortChunkFilesByIndex([])).toEqual([]);
  });
});

describe('resolveRecording', () => {
  it('resolves chunked when recordingChunkPrefix is present (and beats stale single)', () => {
    const data = {
      recordingChunkPrefix_u1: 'recordings/c/u1',
      recordingChunkCount_u1: 5,
      recordingMime_u1: 'audio/webm;codecs=opus',
      recording_u1: 'recordings/c/u1.webm', // stale single must be ignored
    };
    expect(resolveRecording(data, 'u1')).toEqual({
      kind: 'chunked',
      prefix: 'recordings/c/u1',
      count: 5,
      mime: 'audio/webm;codecs=opus',
    });
  });

  it('defaults chunked count/mime when missing', () => {
    const data = { recordingChunkPrefix_u1: 'recordings/c/u1' };
    expect(resolveRecording(data, 'u1')).toEqual({
      kind: 'chunked',
      prefix: 'recordings/c/u1',
      count: 0,
      mime: 'audio/webm',
    });
  });

  it('resolves per-speaker single file', () => {
    const data = { recording_u1: 'recordings/c/u1.webm' };
    expect(resolveRecording(data, 'u1')).toEqual({
      kind: 'single',
      path: 'recordings/c/u1.webm',
    });
  });

  it('resolves the legacy caller fallback (recordingPath)', () => {
    const data = { recordingPath: 'recordings/c/legacy.webm' };
    expect(resolveRecording(data, 'u1', data.recordingPath as string)).toEqual({
      kind: 'single',
      path: 'recordings/c/legacy.webm',
    });
  });

  it('resolves the legacy callee fallback (partnerRecordingPath)', () => {
    const data = { partnerRecordingPath: 'recordings/c/partner.webm' };
    expect(resolveRecording(data, 'u2', data.partnerRecordingPath as string)).toEqual({
      kind: 'single',
      path: 'recordings/c/partner.webm',
    });
  });

  it('returns none when nothing is present', () => {
    expect(resolveRecording({}, 'u1')).toEqual({ kind: 'none' });
    expect(resolveRecording({}, 'u1', null)).toEqual({ kind: 'none' });
  });
});

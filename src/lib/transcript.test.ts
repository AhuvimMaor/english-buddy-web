import { describe, it, expect } from 'vitest';
import { mergeSegments, computeOffsets, dedupeTranscriptLines, overlapScore } from './transcript';

const seg = (start: number, text: string) => ({ start, end: start + 2, text });

describe('mergeSegments', () => {
  it('interleaves speakers in time order', () => {
    const merged = mergeSegments([
      { speaker: 'A', segments: [seg(0, 'Hello how are you'), seg(10, 'I am fine thanks')] },
      { speaker: 'B', segments: [seg(4, 'Good and you today')] },
    ]);
    expect(merged.map((m) => m.speaker)).toEqual(['A', 'B', 'A']);
  });

  it('applies the per-speaker offset before ordering', () => {
    const merged = mergeSegments([
      { speaker: 'A', segments: [seg(0, 'first sentence here'), seg(20, 'third sentence here')] },
      { speaker: 'B', segments: [seg(1, 'second sentence there')], offsetSeconds: 8 },
    ]);
    expect(merged.map((m) => m.text)).toEqual(['first sentence here', 'second sentence there', 'third sentence here']);
  });

  it('drops the echoed copy of a sentence from the other track', () => {
    const merged = mergeSegments([
      { speaker: 'A', segments: [seg(5, 'I went to the market yesterday')] },
      { speaker: 'B', segments: [seg(6, 'I went to the market yesterday.')] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].speaker).toBe('A');
  });

  it('keeps short replies and repeated phrases far apart in time', () => {
    const merged = mergeSegments([
      { speaker: 'A', segments: [seg(0, 'Do you like pizza'), seg(60, 'Do you like pizza')] },
      { speaker: 'B', segments: [seg(3, 'Yes'), seg(63, 'yes')] },
    ]);
    expect(merged).toHaveLength(4);
  });

  it('ignores empty segments', () => {
    expect(mergeSegments([{ speaker: 'A', segments: [seg(0, '  ')] }])).toEqual([]);
  });
});

describe('computeOffsets', () => {
  it('aligns to the earliest recording start', () => {
    expect(computeOffsets({ a: 10_000, b: 12_500 })).toEqual({ a: 0, b: 2.5 });
  });
  it('falls back to zero when a start time is missing', () => {
    expect(computeOffsets({ a: 10_000, b: undefined })).toEqual({ a: 0, b: 0 });
    expect(computeOffsets({ a: null, b: null })).toEqual({ a: 0, b: 0 });
  });
});

describe('dedupeTranscriptLines', () => {
  it('removes consecutive duplicates and cross-speaker echoes', () => {
    const lines = [
      { speaker: 'user', text: 'I am going home now' },
      { speaker: 'user', text: 'I am going home now.' },
      { speaker: 'partner', text: 'I am going home now' },
      { speaker: 'partner', text: 'Ok see you' },
    ];
    expect(dedupeTranscriptLines(lines).map((l) => l.text)).toEqual(['I am going home now', 'Ok see you']);
  });
  it('keeps legitimate short back and forth', () => {
    const lines = [
      { speaker: 'user', text: 'Yes' },
      { speaker: 'partner', text: 'Yes' },
    ];
    expect(dedupeTranscriptLines(lines)).toHaveLength(2);
  });
});

describe('overlapScore', () => {
  it('is 1 for identical text ignoring punctuation and case', () => {
    expect(overlapScore('Hello, World!', 'hello world')).toBe(1);
  });
});

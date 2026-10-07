// Merging the two per-speaker Whisper transcripts into one conversation.
//
// Two things go wrong if we just sort by segment start time:
//  1. Each phone starts recording at a slightly different moment, so the two
//     timelines are offset. We shift them onto one clock using the recording
//     start timestamps.
//  2. A speaker's voice leaks into the other person's mic (speakerphone, echo),
//     so the same sentence is transcribed in both tracks. We drop the later copy.

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface SpeakerSegment extends Segment {
  speaker: string;
}

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Share of the shorter text's words that also appear in the other text.
export function overlapScore(a: string, b: string): number {
  const wa = normalizeWords(a);
  const wb = normalizeWords(b);
  if (wa.length === 0 || wb.length === 0) return 0;
  const setB = new Set(wb);
  const shared = new Set(wa.filter((w) => setB.has(w))).size;
  return shared / Math.min(new Set(wa).size, new Set(wb).size);
}

const ECHO_MIN_WORDS = 3; // short replies like "yes" or "okay" are never treated as echo
const ECHO_MIN_OVERLAP = 0.7;
const ECHO_WINDOW_S = 6; // an echo shows up within a few seconds of the original

function isEcho(seg: SpeakerSegment, original: SpeakerSegment): boolean {
  if (seg.speaker === original.speaker) return false;
  if (normalizeWords(seg.text).length < ECHO_MIN_WORDS) return false;
  if (Math.abs(seg.start - original.start) > ECHO_WINDOW_S) return false;
  return overlapScore(seg.text, original.text) >= ECHO_MIN_OVERLAP;
}

export function mergeSegments(
  tracks: Array<{ speaker: string; segments: Segment[]; offsetSeconds?: number }>
): SpeakerSegment[] {
  const all: SpeakerSegment[] = tracks.flatMap((t) =>
    t.segments
      .filter((s) => s.text.trim().length > 0)
      .map((s) => ({
        speaker: t.speaker,
        text: s.text.trim(),
        start: s.start + (t.offsetSeconds || 0),
        end: s.end + (t.offsetSeconds || 0),
      }))
  );
  all.sort((a, b) => a.start - b.start);

  const kept: SpeakerSegment[] = [];
  for (const seg of all) {
    const recent = kept.filter((k) => seg.start - k.start <= ECHO_WINDOW_S);
    if (recent.some((k) => isEcho(seg, k))) continue;
    kept.push(seg);
  }
  return kept;
}

// Seconds to add to each speaker's timestamps so they share the earliest start.
export function computeOffsets(startedAtMs: Record<string, number | null | undefined>): Record<string, number> {
  const valid = Object.values(startedAtMs).filter((v): v is number => typeof v === 'number' && v > 0);
  const earliest = valid.length > 0 ? Math.min(...valid) : 0;
  const offsets: Record<string, number> = {};
  for (const [id, v] of Object.entries(startedAtMs)) {
    offsets[id] = typeof v === 'number' && v > 0 && earliest > 0 ? (v - earliest) / 1000 : 0;
  }
  return offsets;
}

interface LineLike {
  speaker: string;
  text: string;
}

// Safety net on the model output: remove a line that repeats the previous one
// (same speaker, or the other speaker saying nearly the same words).
export function dedupeTranscriptLines<T extends LineLike>(lines: T[]): T[] {
  const out: T[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev) {
      const same = prev.speaker === line.speaker &&
        normalizeWords(prev.text).join(' ') === normalizeWords(line.text).join(' ');
      const echo = prev.speaker !== line.speaker && normalizeWords(line.text).length >= ECHO_MIN_WORDS &&
        overlapScore(prev.text, line.text) >= ECHO_MIN_OVERLAP;
      if (same || echo) continue;
    }
    out.push(line);
  }
  return out;
}

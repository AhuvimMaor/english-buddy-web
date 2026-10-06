// Helpers for spotting Hebrew words inside mostly-English text.

const HEBREW_LETTER = /[֐-׿]/;

export function containsHebrew(text: string): boolean {
  return HEBREW_LETTER.test(text);
}

export interface CaptionToken {
  text: string;
  hebrew: boolean;
}

// Splits text into word and whitespace tokens (nothing is lost, so joining the
// tokens gives back the original string) and flags the Hebrew ones.
export function tokenizeCaption(text: string): CaptionToken[] {
  return text
    .split(/(\s+)/)
    .filter((t) => t.length > 0)
    .map((t) => ({ text: t, hebrew: containsHebrew(t) }));
}

// Unique Hebrew words in order of appearance, without surrounding punctuation.
// Geresh/gershayim (׳ ״) and maqaf (־) are kept because they are part of words.
export function extractHebrewWords(text: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of text.split(/\s+/)) {
    if (!containsHebrew(raw)) continue;
    const word = raw.replace(/^[^֐-׿]+|[^֐-׿]+$/g, '');
    if (word && !seen.has(word)) {
      seen.add(word);
      words.push(word);
    }
  }
  return words;
}

// Speech models tend to invent short phrases on near-silence. When a whole
// caption is one of these we drop it rather than show a phantom line.
const PHANTOM_PHRASES = new Set([
  'you',
  'thank you',
  'thank you.',
  'thanks.',
  'thanks for watching',
  'thanks for watching!',
  'bye.',
  'bye',
  '.',
]);

export function isPhantomCaption(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length === 0 || PHANTOM_PHRASES.has(t);
}

import { containsHebrew } from './hebrew';
import type { HebrewWord, TranscriptLine } from '@/types';

interface AnalysisLike {
  hebrewWords?: unknown;
  transcript?: unknown;
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Builds the "words to learn" table from the model output. The model's own
// hebrewWords list is the base, then any Hebrew word it corrected inline in the
// learner's transcript is added, so the table never misses a word that is shown
// in the conversation. Entries must contain Hebrew letters and an English
// translation; duplicates are merged on the Hebrew word.
export function mergeHebrewWords(analysis: AnalysisLike): HebrewWord[] {
  const byHebrew = new Map<string, HebrewWord>();

  const add = (hebrew: string, english: string, context: string) => {
    if (!hebrew || !english || !containsHebrew(hebrew)) return;
    const existing = byHebrew.get(hebrew);
    if (!existing) {
      byHebrew.set(hebrew, { hebrew, english, context });
    } else if (!existing.context && context) {
      existing.context = context;
    }
  };

  if (Array.isArray(analysis.hebrewWords)) {
    for (const w of analysis.hebrewWords as Array<Record<string, unknown>>) {
      add(clean(w?.hebrew), clean(w?.english), clean(w?.context));
    }
  }

  if (Array.isArray(analysis.transcript)) {
    for (const line of analysis.transcript as TranscriptLine[]) {
      if (line?.speaker !== 'user' || !Array.isArray(line.corrections)) continue;
      for (const c of line.corrections) {
        const wrong = clean(c?.wrong);
        if (containsHebrew(wrong)) add(wrong, clean(c?.right), clean(line.text));
      }
    }
  }

  return [...byHebrew.values()];
}

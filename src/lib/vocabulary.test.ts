import { describe, it, expect } from 'vitest';
import { mergeHebrewWords } from './vocabulary';

describe('mergeHebrewWords', () => {
  it('keeps the model word list', () => {
    expect(mergeHebrewWords({ hebrewWords: [{ hebrew: 'תודה', english: 'thank you', context: 'toda for the help' }] })).toEqual([
      { hebrew: 'תודה', english: 'thank you', context: 'toda for the help' },
    ]);
  });

  it('adds Hebrew words corrected inline in the learner transcript', () => {
    const result = mergeHebrewWords({
      hebrewWords: [],
      transcript: [
        { speaker: 'user', text: 'I made a מצגת', corrections: [{ wrong: 'מצגת', right: 'presentation', explanation: 'Hebrew word' }] },
        { speaker: 'partner', text: 'Nice', corrections: [{ wrong: 'שלום', right: 'hello', explanation: '' }] },
      ],
    });
    expect(result).toEqual([{ hebrew: 'מצגת', english: 'presentation', context: 'I made a מצגת' }]);
  });

  it('dedupes on the Hebrew word and fills a missing context', () => {
    const result = mergeHebrewWords({
      hebrewWords: [{ hebrew: 'מצגת', english: 'presentation', context: '' }],
      transcript: [{ speaker: 'user', text: 'my מצגת is ready', corrections: [{ wrong: 'מצגת', right: 'presentation', explanation: '' }] }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].context).toBe('my מצגת is ready');
  });

  it('drops entries that are not Hebrew or have no translation', () => {
    expect(
      mergeHebrewWords({
        hebrewWords: [
          { hebrew: 'toda', english: 'thanks', context: '' },
          { hebrew: 'סבבה', english: '', context: '' },
        ],
      })
    ).toEqual([]);
  });

  it('survives garbage input', () => {
    expect(mergeHebrewWords({ hebrewWords: 'nope', transcript: [null, {}] })).toEqual([]);
    expect(mergeHebrewWords({})).toEqual([]);
  });
});

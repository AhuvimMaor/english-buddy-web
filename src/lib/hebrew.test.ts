import { describe, it, expect } from 'vitest';
import { containsHebrew, tokenizeCaption, extractHebrewWords, isPhantomCaption } from './hebrew';

describe('containsHebrew', () => {
  it('detects Hebrew letters', () => {
    expect(containsHebrew('I said תודה')).toBe(true);
    expect(containsHebrew('plain english')).toBe(false);
  });
});

describe('tokenizeCaption', () => {
  it('keeps all text and flags Hebrew tokens', () => {
    const tokens = tokenizeCaption('I want מצגת today');
    expect(tokens.map((t) => t.text).join('')).toBe('I want מצגת today');
    expect(tokens.filter((t) => t.hebrew).map((t) => t.text)).toEqual(['מצגת']);
  });
});

describe('extractHebrewWords', () => {
  it('returns unique Hebrew words without punctuation', () => {
    expect(extractHebrewWords('Say תודה, and then "תודה" or סבבה!')).toEqual(['תודה', 'סבבה']);
  });
  it('keeps geresh inside a word', () => {
    expect(extractHebrewWords("ג'ינס")).toEqual(["ג'ינס"]);
  });
  it('returns an empty list for English only', () => {
    expect(extractHebrewWords('hello there')).toEqual([]);
  });
});

describe('isPhantomCaption', () => {
  it('flags silence hallucinations', () => {
    expect(isPhantomCaption('  Thank you. ')).toBe(true);
    expect(isPhantomCaption('')).toBe(true);
  });
  it('keeps real speech', () => {
    expect(isPhantomCaption('Thank you for the presentation')).toBe(false);
  });
});

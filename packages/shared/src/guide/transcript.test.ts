import { describe, expect, it } from 'vitest';
import { tokenize, wordAt } from './transcript';

const paragraphs = [
  { text: 'Schau nach oben. Die Fassade', startMs: 0, durationMs: 3000 },
  { text: 'ist barock.', startMs: 3000, durationMs: 1000 },
];

describe('wordAt', () => {
  it('walks through the words of a paragraph in order', () => {
    const tokens = tokenize(paragraphs[0]!.text);
    expect(tokens.join('')).toBe(paragraphs[0]!.text);
    const seen = [0, 400, 900, 1500, 2200, 2900].map((ms) => wordAt(paragraphs, ms)!.token);
    expect(seen[0]).toBe(0);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(tokens[seen[seen.length - 1]!]).toBe('Fassade');
  });

  it('moves to the next paragraph and ignores positions outside the narration', () => {
    expect(wordAt(paragraphs, 3100)).toEqual({ paragraph: 1, token: 0 });
    expect(wordAt(paragraphs, 5000)).toBeUndefined();
  });

  it('gives punctuation a pause, so the word after a full stop starts later than by letters alone', () => {
    // "oben." carries a pause: at 45% of the paragraph we are still on it or just past it, never at "Fassade"
    const tokens = tokenize(paragraphs[0]!.text);
    expect(tokens[wordAt(paragraphs, 1350)!.token]).not.toBe('Fassade');
  });
});

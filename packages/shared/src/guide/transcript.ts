import type { Paragraph } from '../narration/types';

/** Splits a paragraph into alternating word and whitespace tokens (joining them gives the original text). */
export function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/** Relative speaking time of a word: its letters plus a pause after punctuation. */
function weight(word: string): number {
  const pause = /[.!?…]$/.test(word) ? 6 : /[,;:—–-]$/.test(word) ? 3 : 0;
  return word.length + 1 + pause;
}

/**
 * Which word is being spoken at `positionMs` (spec 11: transcript for every narration). TTS gives timings per
 * paragraph only, so the paragraph time is spread over its words by length with extra time for punctuation
 * pauses. Returns the paragraph index and the token index within `tokenize(paragraph.text)`.
 */
export function wordAt(
  paragraphs: Paragraph[],
  positionMs: number,
): { paragraph: number; token: number } | undefined {
  const pi = paragraphs.findIndex((p) => positionMs >= p.startMs && positionMs < p.startMs + p.durationMs);
  if (pi < 0) return undefined;
  const p = paragraphs[pi]!;
  const tokens = tokenize(p.text);
  const words = tokens.map((t, i) => ({ t, i })).filter((x) => x.t.trim().length > 0);
  if (words.length === 0) return undefined;
  const total = words.reduce((s, w) => s + weight(w.t), 0);
  const at = ((positionMs - p.startMs) / Math.max(1, p.durationMs)) * total;
  let acc = 0;
  for (const w of words) {
    acc += weight(w.t);
    if (at < acc) return { paragraph: pi, token: w.i };
  }
  return { paragraph: pi, token: words[words.length - 1]!.i };
}

import type { NarrationOutput } from './types';

export interface FactVerdict {
  fact: string;
  supported: boolean;
  evidence?: string;
}

export interface FactCheckResult {
  ok: boolean;
  unsupported: string[];
  reason?: 'llm_unsupported' | 'numbers_not_in_sources' | 'no_key_facts' | 'markup_or_lists';
}

/** Numbers with 3+ digits (years, heights) or dotted forms; these are the classic hallucination targets. */
export function extractNumbers(text: string): string[] {
  return [...new Set(text.match(/\d[\d.,]*\d|\d/g) ?? [])]
    .filter((n) => n.replace(/\D/g, '').length >= 3)
    .map((n) => n.replace(/[.,]/g, ''));
}

const normalizeDigits = (t: string) => t.replace(/(?<=\d)[.,'\s](?=\d{3}\b)/g, '');

/**
 * Cheap deterministic guard: every year/quantity in the narration must occur in the source text. Runs before
 * (and independently of) the LLM check, catching invented numbers without any model cost.
 */
export function unsupportedNumbers(narration: string, sources: string): string[] {
  const hay = normalizeDigits(sources);
  return extractNumbers(normalizeDigits(narration)).filter((n) => !hay.includes(n));
}

/** True when the spoken text contains list/markup artifacts that TTS would read out badly. */
export function hasMarkup(text: string): boolean {
  return (
    /(^|\n)\s*([-*•]|\d+\.)\s/.test(text) ||
    /[*#_`]{1,}/.test(text) ||
    /https?:\/\//.test(text) ||
    /\([^)]*\)/.test(text)
  );
}

/**
 * Combines deterministic guards with the LLM verdicts (spec 4.4.8): any unsupported claim discards the text.
 * `verdicts` must cover every key fact; missing verdicts count as unsupported.
 */
export function evaluateFactCheck(
  out: NarrationOutput,
  sources: string,
  verdicts: FactVerdict[],
): FactCheckResult {
  if (out.keyFacts.length === 0) return { ok: false, unsupported: [], reason: 'no_key_facts' };
  if (hasMarkup(out.narration)) return { ok: false, unsupported: [], reason: 'markup_or_lists' };
  const badNums = unsupportedNumbers(out.narration, sources);
  if (badNums.length) return { ok: false, unsupported: badNums, reason: 'numbers_not_in_sources' };
  const byFact = new Map(verdicts.map((v) => [v.fact, v]));
  const unsupported = out.keyFacts.filter((f) => byFact.get(f)?.supported !== true);
  return unsupported.length
    ? { ok: false, unsupported, reason: 'llm_unsupported' }
    : { ok: true, unsupported: [] };
}

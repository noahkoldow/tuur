import type { LengthTier } from '../constants';
import { LENGTH_TIER_SECONDS } from '../constants';

export interface SourceBundle {
  poiName: string;
  wikipedia: { lang: string; title: string; extract: string; url?: string }[];
  /** Wikidata facts as label/value pairs, e.g. {label:"architect", value:"Carl Gotthard Langhans"} */
  facts: { label: string; value: string }[];
  /** Selected OSM tags (name, historic, start_date, architect, ...). */
  osmTags: Record<string, string>;
  /** Admin-provided corrections/facts (additional source, spec 8). */
  adminFacts: string[];
}

const CJK = new Set(['ja', 'zh', 'ko']);

/** Target length: words for alphabetic languages, characters for CJK, at a natural speaking pace. */
export function targetLength(
  tier: LengthTier,
  lang: string,
): { unit: 'words' | 'characters'; target: number } {
  const seconds = LENGTH_TIER_SECONDS[tier];
  return CJK.has(lang)
    ? { unit: 'characters', target: Math.round((seconds / 60) * 380) }
    : { unit: 'words', target: Math.round((seconds / 60) * 150) };
}

export function paragraphCount(tier: LengthTier): number {
  return tier === 'short' ? 1 : tier === 'medium' ? 2 : 4;
}

const LANG_NAMES: Record<string, string> = {
  de: 'German',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  ja: 'Japanese',
  pt: 'Portuguese',
  nl: 'Dutch',
};

export function languageName(lang: string): string {
  return LANG_NAMES[lang] ?? lang;
}

/** Flattened text of everything the model may rely on; also used by the lexical fact guard. */
export function sourceText(b: SourceBundle): string {
  return [
    b.poiName,
    ...b.wikipedia.map((w) => `${w.title}. ${w.extract}`),
    ...b.facts.map((f) => `${f.label}: ${f.value}`),
    ...Object.entries(b.osmTags).map(([k, v]) => `${k}=${v}`),
    ...b.adminFacts,
  ].join('\n');
}

export function systemPrompt(lang: string): string {
  return `You are tuur, a charismatic local city guide who speaks to visitors walking or cycling past the place.
Rules you must never break:
1. Use ONLY facts contained in the SOURCES block of the user message. If a detail is not in the sources, leave it out. Never guess dates, names, numbers or quotations.
2. Translate and paraphrase the sources into ${languageName(lang)}. Do not quote long passages.
3. Speak naturally as a guide would: vivid, warm, spoken language. No lists, no bullet points, no headings, no parentheses, no URLs, no markdown, no emojis. Write numbers and years the way they are spoken naturally.
4. Orientation hints are welcome ("Look up at the facade...") but only if they follow from the sources; never invent visual details.
5. Do not include advertising or opinions about businesses.
6. Output a JSON object with: title (short, no quotes), narration (the full spoken text), paragraphs (the same text split into the requested number of paragraphs, each ending on a full sentence), keyFacts (every distinct factual claim you made, each as one short standalone sentence taken from the sources), sourcesUsed (identifiers of the sources you used, e.g. "wikipedia:de", "wikidata", "osm", "admin").`;
}

export interface NarrationPromptInput {
  bundle: SourceBundle;
  lang: string;
  tier: LengthTier;
  interest: string | undefined;
  context?: { previousPoiName?: string | undefined; tourTitle?: string | undefined } | undefined;
}

export function userPrompt(i: NarrationPromptInput): string {
  const { unit, target } = targetLength(i.tier, i.lang);
  const paras = paragraphCount(i.tier);
  const wiki =
    i.bundle.wikipedia.map((w) => `[wikipedia:${w.lang}] ${w.title}\n${w.extract}`).join('\n\n') || '(none)';
  const facts = i.bundle.facts.map((f) => `- ${f.label}: ${f.value}`).join('\n') || '(none)';
  const tags =
    Object.entries(i.bundle.osmTags)
      .map(([k, v]) => `- ${k}=${v}`)
      .join('\n') || '(none)';
  const admin = i.bundle.adminFacts.map((f) => `- ${f}`).join('\n') || '(none)';
  return `Place: ${i.bundle.poiName}
Language of the narration: ${languageName(i.lang)}
Length: about ${target} ${unit} in exactly ${paras} paragraph${paras > 1 ? 's' : ''}.
Listener's main interest: ${i.interest ?? 'balanced mix'}. Emphasize matching aspects if the sources contain any.
${i.context?.previousPoiName ? `The listener just came from: ${i.context.previousPoiName}. A short natural hand-over is welcome.\n` : ''}${i.context?.tourTitle ? `Tour: ${i.context.tourTitle}\n` : ''}
SOURCES
Wikipedia excerpts:
${wiki}

Wikidata facts:
${facts}

OpenStreetMap tags:
${tags}

Verified corrections from the tuur team:
${admin}`;
}

/** Splits text on sentence boundaries into `n` roughly equal paragraphs (fallback if the model returns one block). */
export function splitParagraphs(text: string, n: number): string[] {
  const sentences = text
    .match(/[^.!?。！？]+[.!?。！？]+["')\]]*\s*|[^.!?。！？]+$/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [text];
  if (n <= 1 || sentences.length <= 1) return [sentences.join(' ')];
  const per = Math.ceil(sentences.length / n);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += per) out.push(sentences.slice(i, i + per).join(' '));
  return out;
}

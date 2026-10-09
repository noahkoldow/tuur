import { z } from 'zod';
import { unsupportedNumbers } from '../narration/factcheck';

/**
 * Structured place fact sheet shown on the place card: a short summary, labelled key facts and a few themed
 * sections of short bullet items. Labels and section titles are enum keys localized by the client, so neither the
 * model nor the fallback ever invents headings. All strings are length limited to keep the card scannable.
 */
export const FACT_SHEET_LIMITS = {
  summary: 240,
  item: 170,
  factValue: 90,
  itemsPerSection: 4,
  sections: 5,
  facts: 7,
} as const;

export const FACT_SHEET_SECTION_KINDS = ['what', 'history', 'worth', 'visit', 'details'] as const;
export const FACT_SHEET_FACT_KEYS = [
  'built',
  'architect',
  'style',
  'artist',
  'height',
  'heritage',
  'openingHours',
  'fee',
  'address',
  'namedAfter',
] as const;
export type FactSheetSectionKind = (typeof FACT_SHEET_SECTION_KINDS)[number];
export type FactSheetFactKey = (typeof FACT_SHEET_FACT_KEYS)[number];

export const FactSheetSchema = z.object({
  summary: z.string().min(1).max(FACT_SHEET_LIMITS.summary),
  facts: z
    .array(
      z.object({
        key: z.enum(FACT_SHEET_FACT_KEYS),
        value: z.string().min(1).max(FACT_SHEET_LIMITS.factValue),
      }),
    )
    .max(FACT_SHEET_LIMITS.facts),
  sections: z
    .array(
      z.object({
        kind: z.enum(FACT_SHEET_SECTION_KINDS),
        items: z
          .array(z.string().min(1).max(FACT_SHEET_LIMITS.item))
          .min(1)
          .max(FACT_SHEET_LIMITS.itemsPerSection),
      }),
    )
    .max(FACT_SHEET_SECTION_KINDS.length),
});
export type FactSheet = z.infer<typeof FactSheetSchema>;

/** Provider output before normalization: arbitrary lengths and unknown keys are tolerated, then cleaned. */
const LooseFactSheetSchema = z.object({
  summary: z.string(),
  facts: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  sections: z.array(z.object({ kind: z.string(), items: z.array(z.string()).default([]) })).default([]),
});

const ENTITIES: Record<string, string> = {
  amp: '&',
  nbsp: ' ',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
};

/** Plain one-line text: no markup, wiki syntax, bullets or references. */
export function cleanFactText(text: string): string {
  return text
    .replace(/&(#\d+|[a-z]+);/gi, (m, n: string) =>
      n.startsWith('#') ? String.fromCodePoint(Number(n.slice(1)) || 32) : (ENTITIES[n.toLowerCase()] ?? m),
    )
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*#_`]+/g, '')
    .replace(/^\s*(?:[-•]|\d+\.)\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

/** Shortens at a sentence end, else at a word boundary with an ellipsis; never cuts mid-word. */
export function shortenAt(text: string, max: number): string {
  if (text.length <= max) return text;
  const sentences = text.match(/[^]*?[.!?](?=\s|$)/g) ?? [];
  let out = '';
  for (const s of sentences) {
    if (`${out}${s}`.trim().length > max) break;
    out = `${out}${s}`;
  }
  if (out.trim()) return out.trim();
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, '')}…`;
}

const sentencesOf = (text: string): string[] =>
  (text.match(/[^]*?[.!?](?=\s+[\p{Lu}\d„"»]|\s*$)/gu) ?? [text]).map((s) => s.trim()).filter(Boolean);

/**
 * Cleans, deduplicates and limits a (model or fallback) fact sheet. Returns undefined when nothing usable remains.
 */
export function normalizeFactSheet(raw: unknown): FactSheet | undefined {
  const loose = LooseFactSheetSchema.safeParse(raw);
  if (!loose.success) return undefined;
  const summary = shortenAt(cleanFactText(loose.data.summary), FACT_SHEET_LIMITS.summary);
  if (!summary) return undefined;
  const seen = new Set<string>([summary.toLowerCase()]);
  const facts: FactSheet['facts'] = [];
  for (const f of loose.data.facts) {
    const key = FACT_SHEET_FACT_KEYS.find((k) => k === f.key);
    const value = shortenAt(cleanFactText(f.value), FACT_SHEET_LIMITS.factValue);
    if (!key || !value || facts.some((x) => x.key === key)) continue;
    facts.push({ key, value });
  }
  const sections: FactSheet['sections'] = [];
  for (const kind of FACT_SHEET_SECTION_KINDS) {
    const items: string[] = [];
    for (const s of loose.data.sections.filter((x) => x.kind === kind)) {
      for (const i of s.items) {
        const item = shortenAt(cleanFactText(i), FACT_SHEET_LIMITS.item);
        if (!item || seen.has(item.toLowerCase())) continue;
        seen.add(item.toLowerCase());
        items.push(item);
      }
    }
    if (items.length) sections.push({ kind, items: items.slice(0, FACT_SHEET_LIMITS.itemsPerSection) });
  }
  return {
    summary,
    facts: facts.slice(0, FACT_SHEET_LIMITS.facts),
    sections: sections.slice(0, FACT_SHEET_LIMITS.sections),
  };
}

/**
 * Drops items whose numbers (years, sizes) do not occur in the sources. A sheet whose summary is unsupported
 * is rejected entirely (undefined) so the caller falls back to the deterministic sheet.
 */
export function verifyFactSheet(sheet: FactSheet, sources: string): FactSheet | undefined {
  const ok = (s: string) => unsupportedNumbers(s, sources).length === 0;
  if (!ok(sheet.summary)) return undefined;
  return {
    summary: sheet.summary,
    facts: sheet.facts.filter((f) => ok(f.value)),
    sections: sheet.sections
      .map((s) => ({ ...s, items: s.items.filter(ok) }))
      .filter((s) => s.items.length > 0),
  };
}

const HISTORY =
  /\b(1[0-9]{3}|20[0-2][0-9]|[IVX]+\.?\s?(?:Jh|century)|Jahrhundert|century|erbaut|gebaut|errichtet|gegründet|eröffnet|zerstört|wiederaufgebaut|built|founded|opened|destroyed|rebuilt|constructed|erected|established|restored|renovated|saniert)\b/i;
const WORTH =
  /\b(bekannt|berühmt|bedeutend|größte|älteste|einzige|beliebt|bietet|Aussicht|Blick|sehenswert|famous|known for|largest|oldest|only|popular|offers|view|notable|renowned|attracts|besucher|visitors)\b/i;
const VISIT =
  /\b(geöffnet|Eintritt|besichtig|Führung|zugänglich|open to|admission|tours?|visit|accessible|free of charge)\b/i;

/** Classifies a source sentence into a section kind (deterministic, language-agnostic keyword heuristic). */
export function classifySentence(sentence: string): FactSheetSectionKind {
  if (VISIT.test(sentence)) return 'visit';
  if (HISTORY.test(sentence)) return 'history';
  if (WORTH.test(sentence)) return 'worth';
  return 'details';
}

export interface FactSheetSourceInput {
  /** Wikipedia / admin / OSM description text, already in the reader's language where available. */
  text?: string | undefined;
  osmTags?: Record<string, string> | undefined;
  /** Wikidata-derived facts as `{label, value}` (English labels from `WIKIDATA_FACT_PROPS`). */
  wikidata?: { label: string; value: string }[] | undefined;
  lang?: string | undefined;
}

const WIKIDATA_KEYS: Record<string, FactSheetFactKey> = {
  inception: 'built',
  architect: 'architect',
  'architectural style': 'style',
  creator: 'artist',
  'height in meters': 'height',
  'heritage designation': 'heritage',
  'named after': 'namedAfter',
};

/** Facts from structured data (OSM tags, Wikidata) only; empty when nothing is known. */
export function structuredFacts(input: FactSheetSourceInput): FactSheet['facts'] {
  const tags = input.osmTags ?? {};
  const candidates: [FactSheetFactKey, string | undefined][] = [
    ['built', tags['start_date']],
    ['architect', tags['architect']],
    ['artist', tags['artist_name']],
    ['openingHours', tags['opening_hours']],
    [
      'fee',
      tags['fee'] === 'yes'
        ? (tags['charge'] ?? (input.lang === 'de' ? 'Eintritt' : 'Admission fee'))
        : tags['fee'] === 'no'
          ? input.lang === 'de'
            ? 'Kostenlos'
            : 'Free'
          : undefined,
    ],
    ['height', tags['height'] ? `${tags['height'].replace(/\s*m$/, '')} m` : undefined],
    ['heritage', tags['heritage'] && tags['heritage'] !== 'no' ? tags['heritage'] : undefined],
    ['namedAfter', tags['name:etymology']],
    [
      'address',
      tags['addr:street']
        ? `${tags['addr:street']}${tags['addr:housenumber'] ? ` ${tags['addr:housenumber']}` : ''}`
        : undefined,
    ],
  ];
  for (const w of input.wikidata ?? []) {
    const key = WIKIDATA_KEYS[w.label];
    if (key) candidates.unshift([key, key === 'height' ? `${w.value} m` : w.value]);
  }
  const facts: FactSheet['facts'] = [];
  for (const [key, raw] of candidates) {
    const value = raw ? shortenAt(cleanFactText(raw), FACT_SHEET_LIMITS.factValue) : '';
    if (value && !facts.some((f) => f.key === key)) facts.push({ key, value });
  }
  return facts.slice(0, FACT_SHEET_LIMITS.facts);
}

/**
 * Deterministic fact sheet without AI: first sentence(s) become the summary, the remaining sentences are sorted
 * into history / worth / visit / details bullets, structured tags become labelled facts.
 */
export function fallbackFactSheet(input: FactSheetSourceInput): FactSheet | undefined {
  const text = cleanFactText(input.text ?? '');
  const facts = structuredFacts(input);
  if (!text) return undefined;
  const sentences = sentencesOf(text);
  let summary = sentences[0] ?? text;
  let used = 1;
  while (summary.length < 30 && used < sentences.length && `${summary} ${sentences[used]}`.length <= 160) {
    summary = `${summary} ${sentences[used]}`;
    used += 1;
  }
  const buckets = new Map<FactSheetSectionKind, string[]>();
  for (const sentence of sentences.slice(used)) {
    const kind = classifySentence(sentence);
    buckets.set(kind, [...(buckets.get(kind) ?? []), sentence]);
  }
  return normalizeFactSheet({
    summary,
    facts,
    sections: [...buckets].map(([kind, items]) => ({ kind, items })),
  });
}

/** Prompt for the model: JSON only, sources only, short items. */
export function factSheetPrompt(args: { name: string; lang: string; sources: string }): {
  system: string;
  user: string;
} {
  const language = args.lang === 'de' ? 'German' : args.lang === 'en' ? 'English' : args.lang;
  const system = `You write compact, factual visitor fact sheets for places in a city guide app.
Rules:
1. Use ONLY facts contained in the SOURCES. Never guess dates, names, numbers, opening hours or prices. If unknown, omit it.
2. Write in ${language}. Neutral, concrete, no marketing, no second person, no markdown, no URLs, no emojis.
3. Output JSON: {"summary": string (one or two sentences, at most ${FACT_SHEET_LIMITS.summary} characters), "facts": [{"key": one of ${FACT_SHEET_FACT_KEYS.join('|')}, "value": string (at most ${FACT_SHEET_LIMITS.factValue} characters)}], "sections": [{"kind": one of ${FACT_SHEET_SECTION_KINDS.join('|')}, "items": string[]}]}.
4. Section kinds: what = what the place is; history = origin and key events; worth = why it is worth a stop; visit = practical visit information (access, admission, hours); details = other notable details.
5. Each section has 1 to ${FACT_SHEET_LIMITS.itemsPerSection} items, each ONE short sentence or phrase of at most ${FACT_SHEET_LIMITS.item} characters. Omit sections without sourced content. Do not repeat the summary.
6. facts only for built (year), architect, style, artist, height, heritage, openingHours, fee, address, namedAfter, and only when stated in the SOURCES.`;
  return { system, user: `PLACE: ${args.name}\n\nSOURCES:\n${args.sources}` };
}

import type { Poi, WikipediaRef } from '@tuur/shared';

export interface PlaceInformation {
  text: string;
  sourceUrl?: string;
  /** Omitted for Wikipedia extracts to preserve the existing attribution. */
  sourceName?: string;
}

const SUMMARY_LENGTH = 190;

const ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

function cleanExtract(extract: string): string {
  return extract
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (!name.startsWith('#')) return ENTITIES[name.toLowerCase()] ?? entity;
      const hex = name[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style|ref)\b[^>]*>[^]*?<\/\1\s*>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\[\d+(?:[,–-]\s*\d+)*\]/g, '')
    .replace(/^=+\s*(.*?)\s*=+$/gm, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function shorten(text: string): string {
  if (text.length <= SUMMARY_LENGTH) return text;
  const sentences = text.match(/[^]*?[.!?。！？]["'’”»]?(?=\s|$)/g) ?? [];
  let summary = '';
  for (const sentence of sentences) {
    const next = `${summary}${sentence}`.trim();
    if (next.length > SUMMARY_LENGTH) break;
    summary = next;
  }
  if (summary) return summary;
  const prefix = text.slice(0, SUMMARY_LENGTH - 1);
  const wordBoundary = prefix.lastIndexOf(' ');
  return `${(wordBoundary > 0 ? prefix.slice(0, wordBoundary) : prefix).trimEnd()}…`;
}

function sourceOf(ref: WikipediaRef): string | undefined {
  if (ref.url) {
    try {
      const source = new URL(ref.url);
      if (
        (source.protocol === 'https:' || source.protocol === 'http:') &&
        /^(?:[a-z0-9-]+\.)?wikipedia\.org$/i.test(source.hostname) &&
        !source.username &&
        !source.password
      ) {
        return source.toString();
      }
    } catch {
      // Older source records may omit the URL; the article identity is sufficient.
    }
  }
  const locale = ref.lang.trim().toLowerCase();
  const title = ref.title.trim();
  if (!/^[a-z]{2,12}(?:-[a-z0-9]{2,12}){0,2}$/.test(locale) || !title) return undefined;
  return `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
}

function bestExtract(poi: Poi, baseLanguage: string | undefined) {
  const available = poi.sources.wikipedia
    .map((ref) => ({ ref, text: cleanExtract(ref.extract ?? '') }))
    .filter(({ text }) => text.length > 0);
  return (
    available.find(({ ref }) => ref.lang.toLowerCase() === baseLanguage) ??
    available.find(({ ref }) => ref.lang.toLowerCase() === 'en') ??
    available[0]
  );
}

/** Language code of the shown Wikipedia text when it is not the UI language, so the card can say so. */
export function foreignTextLanguage(poi: Poi, lang: string): string | undefined {
  const baseLanguage = lang.trim().toLowerCase().split(/[-_]/)[0];
  const best = bestExtract(poi, baseLanguage);
  const code = best?.ref.lang.toLowerCase();
  return code && code !== baseLanguage ? code : undefined;
}

/** Full, readable source text, in the UI language when an extract exists. */
export function placeInformation(poi: Poi, lang: string): PlaceInformation | undefined {
  const baseLanguage = lang.trim().toLowerCase().split(/[-_]/)[0];
  const best = bestExtract(poi, baseLanguage);
  if (!best) {
    const facts = poi.adminFacts.map(cleanExtract).filter(Boolean);
    if (facts.length) return { text: facts.join('\n\n'), sourceName: 'tuur' };
    const description = cleanExtract(
      poi.osmTags[`description:${baseLanguage}`] ?? poi.osmTags.description ?? '',
    );
    const inscription = cleanExtract(
      poi.osmTags[`inscription:${baseLanguage}`] ?? poi.osmTags.inscription ?? '',
    );
    const text = [description, inscription].filter(Boolean).join('\n\n');
    if (!text) return undefined;
    if (poi.osmTags['tuur:demo'] === 'yes') return { text, sourceName: 'tuur Demo' };
    const osmId = poi.sources.osmId;
    return {
      text,
      sourceName: 'OpenStreetMap',
      ...(osmId && /^(node|way|relation)\/\d+$/.test(osmId)
        ? { sourceUrl: `https://www.openstreetmap.org/${osmId}` }
        : {}),
    };
  }
  const sourceUrl = sourceOf(best.ref);
  return { text: best.text, ...(sourceUrl ? { sourceUrl } : {}) };
}

/** A short source-backed introduction for cards. Reading a past stop uses the full information above. */
export function placeSummary(poi: Poi, lang: string): PlaceInformation | undefined {
  const information = placeInformation(poi, lang);
  return information ? { ...information, text: shorten(information.text) } : undefined;
}

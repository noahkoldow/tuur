import type { LengthTier } from '../constants';
import type { SourceBundle } from './prompt';
import { sourceText } from './prompt';

/** Wikidata properties surfaced as guide facts. */
export const WIKIDATA_FACT_PROPS: Record<string, string> = {
  P571: 'inception',
  P84: 'architect',
  P149: 'architectural style',
  P138: 'named after',
  P170: 'creator',
  P793: 'significant event',
  P1435: 'heritage designation',
  P2048: 'height in meters',
  P2044: 'elevation above sea level in meters',
  P1082: 'population',
};

export const OSM_TAG_ALLOWLIST = [
  'name',
  'historic',
  'start_date',
  'architect',
  'building',
  'heritage',
  'tourism',
  'artwork_type',
  'description',
  'inscription',
  'amenity',
  'religion',
  'denomination',
  'man_made',
  'natural',
  'leisure',
  'ele',
  'height',
  'artist_name',
];

export function filterOsmTags(tags: Record<string, string>, lang: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of OSM_TAG_ALLOWLIST) if (tags[k]) out[k] = tags[k]!;
  const d = tags[`description:${lang}`];
  if (d) out['description'] = d;
  return out;
}

interface WbClaim {
  mainsnak?: { datavalue?: { value?: unknown; type?: string } };
}

function claimValue(c: WbClaim): unknown {
  return c.mainsnak?.datavalue?.value;
}

/** "+1791-00-00T00:00:00Z" -> "1791" (BCE as "-44"). */
export function wikidataYear(time: string): string | undefined {
  const m = /^([+-])(\d{1,})-/.exec(time);
  if (!m?.[2]) return undefined;
  const y = String(Number(m[2]));
  return m[1] === '-' ? `-${y}` : y;
}

/**
 * Turns a `wbgetentities` response into label/value facts. Entity-valued claims are returned as ids in
 * `pendingLabels` so the caller can resolve them with a second call (then `applyLabels`).
 */
export function parseWikidataFacts(
  json: unknown,
  id: string,
): {
  facts: { label: string; value: string }[];
  pendingLabels: string[];
  entityFacts: { label: string; qid: string }[];
} {
  const claims =
    (json as { entities?: Record<string, { claims?: Record<string, WbClaim[]> }> } | null)?.entities?.[id]
      ?.claims ?? {};
  const facts: { label: string; value: string }[] = [];
  const entityFacts: { label: string; qid: string }[] = [];
  for (const [prop, label] of Object.entries(WIKIDATA_FACT_PROPS)) {
    for (const c of (claims[prop] ?? []).slice(0, 3)) {
      const v = claimValue(c) as Record<string, unknown> | string | undefined;
      if (v === undefined) continue;
      if (typeof v === 'object' && typeof v['time'] === 'string') {
        const y = wikidataYear(v['time']);
        if (y) facts.push({ label, value: y });
      } else if (typeof v === 'object' && typeof v['id'] === 'string') {
        entityFacts.push({ label, qid: v['id'] });
      } else if (typeof v === 'object' && typeof v['amount'] === 'string') {
        facts.push({ label, value: v['amount'].replace(/^\+/, '') });
      } else if (typeof v === 'string') {
        facts.push({ label, value: v });
      }
    }
  }
  return { facts, pendingLabels: [...new Set(entityFacts.map((e) => e.qid))], entityFacts };
}

export function labelsFromEntities(json: unknown, langs: string[]): Map<string, string> {
  const ents =
    (json as { entities?: Record<string, { labels?: Record<string, { value: string }> }> } | null)
      ?.entities ?? {};
  const out = new Map<string, string>();
  for (const [qid, e] of Object.entries(ents)) {
    for (const l of langs) {
      const v = e.labels?.[l]?.value;
      if (v) {
        out.set(qid, v);
        break;
      }
    }
  }
  return out;
}

/** `prop=extracts&explaintext=1` result -> map of normalized title -> text. */
export function parseWikipediaExtracts(json: unknown): Map<string, string> {
  const pages =
    (json as { query?: { pages?: Record<string, { title?: string; extract?: string }> } } | null)?.query
      ?.pages ?? {};
  const out = new Map<string, string>();
  for (const p of Object.values(pages))
    if (p.title && p.extract) out.set(p.title, p.extract.replace(/\n{2,}/g, '\n').trim());
  return out;
}

/** How much a POI can support: below the thresholds only short (or no) narrations are allowed (spec 4.2). */
export function sourceRichness(b: SourceBundle): number {
  return sourceText(b).length - b.poiName.length;
}

export type TierDecision = { ok: true; tier: LengthTier } | { ok: false; reason: 'insufficient_sources' };

export function effectiveTier(requested: LengthTier, richness: number): TierDecision {
  if (richness < 60) return { ok: false, reason: 'insufficient_sources' };
  const cap: LengthTier = richness < 400 ? 'short' : richness < 1200 ? 'medium' : 'long';
  const order: LengthTier[] = ['short', 'medium', 'long'];
  return { ok: true, tier: order[Math.min(order.indexOf(requested), order.indexOf(cap))]! };
}

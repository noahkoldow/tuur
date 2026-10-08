import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { NarrationLangSchema, PoiSchema, type Poi, type SourceBundle } from '@tuur/shared';
import { z } from 'zod';
import { authorizeTextContent } from '../billing/entitlements';
import type { NarrationSourceProvider } from '../providers/narrationSources';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';

export const POI_TEXT_TTL_MS = 7 * 24 * 3600_000;
export const POI_TEXT_RETRY_MS = 30_000;
const PARTIAL_TEXT_TTL_MS = 5 * 60_000;
const MAX_EXTRACT_LENGTH = 5000;
const MAX_REQUESTS_PER_HOUR = 240;

export interface PoiTextDeps {
  db: Firestore;
  sources: NarrationSourceProvider;
  now: () => number;
}
export class PoiTextError extends Error {
  constructor(
    readonly code:
      'unauthenticated' | 'invalid-argument' | 'not-found' | 'unavailable' | 'resource-exhausted',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
const RequestSchema = z.object({
  poiId: z
    .string()
    .min(1)
    .max(120)
    .refine((id) => !id.includes('/')),
  lang: NarrationLangSchema,
  access: z
    .object({
      tourId: z.string().max(200).optional(),
      groupId: z
        .string()
        .regex(/^[A-Za-z0-9]{10,40}$/)
        .optional(),
      mode: z.enum(['tour', 'planned', 'fork', 'roam']).optional(),
      sessionId: z.string().max(200).optional(),
    })
    .optional(),
});
const ExtractSchema = z.object({
  lang: z.string(),
  title: z.string(),
  extract: z.string().min(1).max(MAX_EXTRACT_LENGTH),
});
const CacheSchema = z.object({
  version: z.literal(1),
  poiUpdatedAt: z.number(),
  expiresAt: z.number(),
  wikipedia: z.array(ExtractSchema).max(3),
});
type Extract = z.infer<typeof ExtractSchema>;
const unavailable = (retryAfterMs: number) =>
  new PoiTextError('unavailable', 'Place source text is temporarily unavailable', {
    reason: 'poi_text_unavailable',
    retryAfterMs,
  });

/** Keep canonical titles/URLs and POI facts; enrich only matching, already trusted Wikipedia references. */
function withExtracts(poi: Poi, extracts: Extract[]): Poi {
  return {
    ...poi,
    sources: {
      ...poi.sources,
      wikipedia: poi.sources.wikipedia.map((reference) => {
        const match = extracts.find(
          (entry) => entry.lang === reference.lang && entry.title === reference.title,
        );
        return match ? { ...reference, extract: match.extract } : reference;
      }),
    },
  };
}

/** Public-source information only: no model, TTS, audio store, wallet or audio lease dependency. */
export async function getPoiText(deps: PoiTextDeps, uid: string | undefined, raw: unknown): Promise<Poi> {
  if (!uid) throw new PoiTextError('unauthenticated', 'Sign in first');
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) throw new PoiTextError('invalid-argument', 'Invalid place text request');
  const { poiId, lang, access } = parsed.data;
  const snapshot = await deps.db.collection('pois').doc(poiId).get();
  const stored = snapshot.exists ? PoiSchema.safeParse(snapshot.data()) : undefined;
  if (!stored?.success || stored.data.id !== poiId || stored.data.hidden)
    throw new PoiTextError('not-found', 'Place not available');
  const poi = stored.data;
  // Recheck visibility and claimed tour/private-route context before every cache hit as well as a miss.
  await authorizeTextContent(deps, uid, { ...access, poiIds: [poi.id], tile: poi.tile });
  try {
    await consumeRateLimit(deps.db, `poi_text_user_${uid}`, MAX_REQUESTS_PER_HOUR, 3600_000, deps.now());
  } catch (error) {
    if (error instanceof RateLimitError)
      throw new PoiTextError('resource-exhausted', 'Too many place text requests', {
        retryAfterMs: error.retryAfterMs,
      });
    throw error;
  }
  if (!poi.sources.wikipedia.length) return poi;
  if (poi.sources.wikipedia.some((reference) => reference.lang === lang && reference.extract?.trim()))
    return poi;
  const cacheId = createHash('sha256').update(`${poiId}\0${lang}`).digest('hex');
  const cacheRef = deps.db.collection('poiTexts').doc(cacheId);
  const cache = CacheSchema.safeParse((await cacheRef.get()).data());
  if (cache.success && cache.data.poiUpdatedAt === poi.updatedAt && cache.data.expiresAt > deps.now()) {
    if (!cache.data.wikipedia.length) throw unavailable(cache.data.expiresAt - deps.now());
    return withExtracts(poi, cache.data.wikipedia);
  }

  let gathered: SourceBundle['wikipedia'];
  try {
    gathered = (await deps.sources.gather(poi, [...new Set([lang, 'de', 'en'])])).wikipedia;
  } catch {
    gathered = [];
  }
  const wikipedia: Extract[] = gathered
    .flatMap((entry) => {
      if (
        !poi.sources.wikipedia.some(
          (reference) => reference.lang === entry.lang && reference.title === entry.title,
        )
      )
        return [];
      const extract = entry.extract.trim().slice(0, MAX_EXTRACT_LENGTH);
      return extract ? [{ lang: entry.lang, title: entry.title, extract }] : [];
    })
    .slice(0, 3);
  const missingPreferred =
    poi.sources.wikipedia.some((reference) => reference.lang === lang) &&
    !wikipedia.some((entry) => entry.lang === lang);
  const ttl = !wikipedia.length
    ? POI_TEXT_RETRY_MS
    : missingPreferred
      ? PARTIAL_TEXT_TTL_MS
      : POI_TEXT_TTL_MS;
  const now = deps.now();
  await cacheRef.set({
    version: 1,
    poiId,
    lang,
    poiUpdatedAt: poi.updatedAt,
    wikipedia,
    fetchedAt: now,
    expiresAt: now + ttl,
    expireAt: new Date(now + ttl),
  });
  if (!wikipedia.length) throw unavailable(POI_TEXT_RETRY_MS);
  return withExtracts(poi, wikipedia);
}

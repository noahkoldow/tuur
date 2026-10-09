import type { Firestore } from 'firebase-admin/firestore';
import {
  budgetDecision,
  scoreWithPartner,
  DEFAULT_QUALITY,
  PoiSchema,
  PlaceSchema,
  buildPois,
  countQualityPois,
  geohashBounds,
  geohashCenter,
  sourceLangsFor,
  statusForIngest,
  tileWithNeighbors,
  DEFAULT_CLAIM_POLICY,
  type AiConfig,
  type ImageRef,
  type Interest,
  type LatLng,
  type Place,
  type Poi,
  type QualityOptions,
  type RawPoi,
} from '@tuur/shared';
import type { GeocodingProvider } from '../providers/geocoding';
import { placeFromGeocode } from '../providers/geocoding';
import type { LlmProvider } from '../providers/llm';
import type { PoiSourceClient } from '../providers/poiSources';
import { loadPartnerConfig } from '../partners/service';
import { spentToday } from '../util/usage';
import { budgetedLlm } from '../providers/budgeted';
import { RateLimitError } from '../util/rateLimit';
import { AREAS, deferAreaForQuota, markAreaFailed } from './store';

export interface IngestDeps {
  db: Firestore;
  sources: PoiSourceClient;
  geocoder: GeocodingProvider;
  llm: LlmProvider;
  /** Model names and prices come from `config/ai`, never hard-coded. */
  ai: Pick<AiConfig, 'models' | 'pricing' | 'dailyBudgetUsd' | 'areaDailyBudgetUsd' | 'killSwitch'>;
  now: () => number;
  quality?: QualityOptions;
  ttlMs?: number;
}

async function settled<T>(p: Promise<T>, fallback: T, label: string, warnings: string[]): Promise<T> {
  try {
    return await p;
  } catch (e) {
    warnings.push(`${label}: ${(e as Error).message}`);
    return fallback;
  }
}

/**
 * The geocoder only names the surrounding city. A quota or outage there must not fail a tile whose places
 * are already in hand: fall back to the place of an already ingested neighbor, and fail only without one.
 */
async function resolvePlace(deps: IngestDeps, geohash: string, center: LatLng): Promise<Place> {
  try {
    return placeFromGeocode(await deps.geocoder.reverse(center), center, deps.now());
  } catch (error) {
    for (const neighbor of tileWithNeighbors(geohash).filter((t) => t !== geohash)) {
      const placeId = (await deps.db.collection(AREAS).doc(neighbor).get()).get('placeId');
      if (typeof placeId !== 'string' || !placeId) continue;
      const known = await deps.db.collection('places').doc(placeId).get();
      const parsed = PlaceSchema.safeParse(known.data());
      if (parsed.success) return parsed.data;
    }
    throw error;
  }
}

/**
 * Ingest one tile: fetch OSM + Wikidata + Wikipedia (local language, DE, EN), merge, classify (rules, then
 * the lite LLM for edge cases), score relative to the surroundings and persist POIs plus the area status.
 * OSM is the anchor source: if it fails the job fails (and is retried) instead of publishing a hollow area.
 */
export async function ingestArea(
  deps: IngestDeps,
  geohash: string,
): Promise<{ status: string; poiCount: number; warnings: string[] }> {
  const { db } = deps;
  // Cloud Tasks can redeliver independently of ensureArea's claim guard. Keep the stored deadline
  // unchanged and make no provider request until it expires, including after an upstream HTTP 429.
  const area = await db.collection(AREAS).doc(geohash).get();
  const retryAt = area.get('ingestRetryAt');
  const startAt = deps.now();
  if (
    ['ready', 'low_content'].includes(String(area.get('status'))) &&
    (area.get('locked') === true || Number(area.get('expiresAt') ?? 0) > startAt)
  )
    return { status: String(area.get('status')), poiCount: Number(area.get('poiCount') ?? 0), warnings: [] };
  if (area.get('status') === 'failed' && typeof retryAt === 'number' && retryAt > startAt)
    throw new RateLimitError(retryAt - startAt);
  const warnings: string[] = [];
  const bounds = geohashBounds(geohash);
  const center = geohashCenter(geohash);
  try {
    // OSM is required. Do not spend geocoding/enrichment calls when it is unavailable or quota-blocked.
    const osm = await deps.sources.fetchOsm(bounds);
    const place = await resolvePlace(deps, geohash, center);
    const langs = sourceLangsFor(place.countryCode);
    const [wikidata, ...wikis] = await Promise.all([
      settled(deps.sources.fetchWikidata(bounds), [] as RawPoi[], 'wikidata', warnings),
      ...langs.map((l) =>
        settled(deps.sources.fetchWikipedia(bounds, l), [] as RawPoi[], `wikipedia:${l}`, warnings),
      ),
    ]);
    const raw = [...osm, ...wikidata, ...wikis.flat()].filter(
      (p) =>
        p.location.lat >= bounds.south &&
        p.location.lat < bounds.north &&
        p.location.lng >= bounds.west &&
        p.location.lng < bounds.east,
    );

    const files = [...new Set(raw.map((r) => r.imageFile).filter((f): f is string => Boolean(f)))];
    const images = files.length
      ? await settled(deps.sources.fetchImages(files), new Map<string, ImageRef>(), 'commons', warnings)
      : new Map<string, ImageRef>();

    // Neighborhood context for relative scoring: raw scores of already ingested neighbor tiles.
    const neighborSnap = await db
      .collection('pois')
      .where(
        'tile',
        'in',
        tileWithNeighbors(geohash).filter((t) => t !== geohash),
      )
      .select('rawScore')
      .limit(1500)
      .get();
    const neighborRawScores = neighborSnap.docs.map((d) => Number(d.get('rawScore') ?? 0));

    let result = buildPois(raw, { now: deps.now(), images, neighborRawScores, precision: geohash.length });
    // Classification costs model calls: the kill switch and the budgets apply here as well (rule-based scores still work).
    const gate = budgetDecision(deps.ai, await spentToday(db, geohash, deps.now()));
    if (!gate.allowed) warnings.push(`llm classification skipped: ${gate.reason}`);
    if (result.unclassified.length && gate.allowed) {
      const llm = await settled(
        budgetedLlm(deps.llm, db, deps.ai, deps.now, { tile: geohash }).classifyInterests(
          result.unclassified.slice(0, 60),
          deps.ai.models.lite,
        ),
        { interests: {} as Record<string, Interest[]>, usage: {} },
        'llm',
        warnings,
      );
      result = buildPois(raw, {
        now: deps.now(),
        images,
        neighborRawScores,
        precision: geohash.length,
        llmInterests: new Map(Object.entries(llm.interests)),
      });
    }

    const existing = await db.collection('pois').where('tile', '==', geohash).get();
    const existingById = new Map(existing.docs.map((d) => [d.id, d.data()]));
    const { cfg: partnerCfg } = await loadPartnerConfig(db);
    const pois: Poi[] = result.pois.map((p) => {
      // Preserve moderation state across re-ingests (spec 8): hide flag, weight, facts, partner link.
      const prev = existingById.get(p.id);
      if (!prev) return p;
      return {
        ...p,
        hidden: Boolean(prev['hidden']),
        adminWeight: Number(prev['adminWeight'] ?? 1),
        adminFacts: (prev['adminFacts'] as string[] | undefined) ?? [],
        ...(prev['partnerId'] ? { partnerId: String(prev['partnerId']) } : {}),
        partnerBoost: Number(prev['partnerBoost'] ?? 0),
        score: scoreWithPartner(
          p.baseScore,
          Number(prev['adminWeight'] ?? 1),
          Number(prev['partnerBoost'] ?? 0),
          partnerCfg,
        ),
      };
    });

    const quality = deps.quality ?? DEFAULT_QUALITY;
    const status = statusForIngest(pois, quality);
    const now = deps.now();

    const batchSize = 400;
    for (let i = 0; i < pois.length; i += batchSize) {
      const batch = db.batch();
      for (const p of pois.slice(i, i + batchSize))
        batch.set(db.collection('pois').doc(p.id), PoiSchema.parse(p));
      await batch.commit();
    }
    // Remove POIs that disappeared from the sources (unless moderated/partner-linked).
    const keep = new Set(pois.map((p) => p.id));
    const stale = existing.docs.filter(
      (d) => !keep.has(d.id) && !d.get('partnerId') && !d.id.startsWith('partner_'),
    );
    for (let i = 0; i < stale.length; i += batchSize) {
      const batch = db.batch();
      for (const d of stale.slice(i, i + batchSize)) batch.delete(d.ref);
      await batch.commit();
    }
    await db.collection('places').doc(place.id).set(place, { merge: true });
    await db
      .collection(AREAS)
      .doc(geohash)
      .set(
        {
          status,
          updatedAt: now,
          expiresAt: now + (deps.ttlMs ?? DEFAULT_CLAIM_POLICY.ttlMs),
          poiCount: pois.length,
          qualityPoiCount: countQualityPois(pois, quality),
          placeId: place.id,
          ...(warnings.length ? { error: `partial: ${warnings.join('; ').slice(0, 400)}` } : {}),
        },
        { merge: true },
      );
    return { status, poiCount: pois.length, warnings };
  } catch (e) {
    if (e instanceof RateLimitError) await deferAreaForQuota(db, geohash, e.retryAfterMs, deps.now());
    else await markAreaFailed(db, geohash, (e as Error).message, deps.now());
    throw e;
  }
}

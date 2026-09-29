import type { Firestore } from 'firebase-admin/firestore';
import {
  DEFAULT_QUALITY,
  PoiSchema,
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
  type Poi,
  type QualityOptions,
  type RawPoi,
} from '@tuur/shared';
import type { GeocodingProvider } from '../providers/geocoding';
import { placeFromGeocode } from '../providers/geocoding';
import type { LlmProvider } from '../providers/llm';
import type { PoiSourceClient } from '../providers/poiSources';
import { logUsage } from '../util/usage';
import { AREAS, markAreaFailed } from './store';

export interface IngestDeps {
  db: Firestore;
  sources: PoiSourceClient;
  geocoder: GeocodingProvider;
  llm: LlmProvider;
  /** Model names and prices come from `config/ai`, never hard-coded. */
  ai: Pick<AiConfig, 'models' | 'pricing'>;
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
 * Ingest one tile: fetch OSM + Wikidata + Wikipedia (local language, DE, EN), merge, classify (rules, then
 * the lite LLM for edge cases), score relative to the surroundings and persist POIs plus the area status.
 * OSM is the anchor source: if it fails the job fails (and is retried) instead of publishing a hollow area.
 */
export async function ingestArea(
  deps: IngestDeps,
  geohash: string,
): Promise<{ status: string; poiCount: number; warnings: string[] }> {
  const { db } = deps;
  const warnings: string[] = [];
  const bounds = geohashBounds(geohash);
  const center = geohashCenter(geohash);
  try {
    const place = placeFromGeocode(await deps.geocoder.reverse(center), center, deps.now());
    const langs = sourceLangsFor(place.countryCode);
    const [osm, wikidata, ...wikis] = await Promise.all([
      deps.sources.fetchOsm(bounds),
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
    if (result.unclassified.length) {
      const llm = await settled(
        deps.llm.classifyInterests(result.unclassified.slice(0, 60), deps.ai.models.lite),
        { interests: {} as Record<string, Interest[]>, usage: {} },
        'llm',
        warnings,
      );
      await logUsage(
        db,
        deps.ai.pricing,
        { kind: 'classify', model: deps.ai.models.lite, usage: llm.usage, tile: geohash, ok: true },
        deps.now(),
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
        score: Math.round(Math.min(100, p.baseScore * Number(prev['adminWeight'] ?? 1))),
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
    const stale = existing.docs.filter((d) => !keep.has(d.id) && !d.get('partnerId'));
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
    await markAreaFailed(db, geohash, (e as Error).message, deps.now());
    throw e;
  }
}

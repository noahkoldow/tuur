import {
  PoiSchema,
  SelectNearbyRequestSchema,
  budgetDecision,
  isValidGeohash,
  tilesAround,
  type Poi,
  type SelectNearbyResult,
} from '@tuur/shared';
import { NarrationError } from '../narration/service';
import type { TeaserDeps } from '../narration/teaser';
import { budgetedLlm } from '../providers/budgeted';
import { loadAiConfig } from '../util/aiConfig';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';
import { spentToday } from '../util/usage';

export type SelectNearbyDeps = Pick<TeaserDeps, 'db' | 'llm' | 'now' | 'authorize' | 'config'>;

/** Optional Gemini ordering of real, accessible nearby places; never creates a POI or a place fact. */
export async function selectNearby(
  deps: SelectNearbyDeps,
  uid: string,
  raw: unknown,
): Promise<SelectNearbyResult> {
  const parsed = SelectNearbyRequestSchema.safeParse(raw);
  if (!parsed.success) throw new NarrationError('invalid-argument', 'Invalid nearby selection request');
  const req = parsed.data;
  try {
    await consumeRateLimit(deps.db, `nearby_user_${uid}`, 60, 3600_000, deps.now());
  } catch (error) {
    if (error instanceof RateLimitError)
      throw new NarrationError('resource-exhausted', 'Too many requests', {
        retryAfterMs: error.retryAfterMs,
      });
    throw error;
  }

  const loaded = await Promise.all(
    [...new Set(req.candidateIds)].map(async (id): Promise<Poi | undefined> => {
      const snap = await deps.db.collection('pois').doc(id).get();
      const parsedPoi = snap.exists ? PoiSchema.safeParse(snap.data()) : undefined;
      if (!parsedPoi?.success) return undefined;
      const poi = parsedPoi.data;
      if (poi.id !== id || poi.hidden || !poi.accessible || !isValidGeohash(poi.tile, 6)) return undefined;
      try {
        await deps.authorize?.(uid, poi, req.access);
      } catch (error) {
        if (error instanceof NarrationError && ['permission-denied', 'not-found'].includes(error.code))
          return undefined;
        throw error;
      }
      return poi;
    }),
  );
  const allowed = loaded.filter((poi): poi is Poi => Boolean(poi));
  const anchor = allowed[0];
  if (!anchor) return { poiIds: [], source: 'fallback' };
  const neighborhood = new Set(tilesAround(anchor.tile, 1));
  const candidates = allowed.filter((poi) => neighborhood.has(poi.tile));
  const ids = candidates.map((poi) => poi.id);
  const fallback: SelectNearbyResult = { poiIds: ids, source: 'fallback' };
  if (ids.length < 2) return fallback;

  const cfg = await (deps.config ?? (() => loadAiConfig(deps.db, deps.now())))();
  if (!budgetDecision(cfg, await spentToday(deps.db, anchor.tile, deps.now())).allowed) return fallback;
  try {
    const selected = await budgetedLlm(deps.llm, deps.db, cfg, deps.now, { tile: anchor.tile }).selectNearby({
      model: cfg.models.lite,
      lang: req.lang,
      interests: req.interests,
      ...(req.thread ? { thread: req.thread } : {}),
      ...(req.previousPoiName ? { previousPoiName: req.previousPoiName } : {}),
      candidates: candidates.map((poi) => ({
        id: poi.id,
        name: (poi.names[req.lang] ?? poi.name).slice(0, 160),
        interests: poi.interests,
        kind: (
          poi.osmTags['historic'] ??
          poi.osmTags['tourism'] ??
          poi.osmTags['amenity'] ??
          poi.osmTags['place'] ??
          poi.osmTags['highway'] ??
          poi.primaryInterest ??
          ''
        ).slice(0, 100),
        sourceHint: (
          poi.sources.wikipedia.find((ref) => ref.lang === req.lang)?.extract ??
          poi.sources.wikipedia.find((ref) => ref.extract)?.extract ??
          ''
        ).slice(0, 400),
      })),
    });
    const allowlist = new Set(ids);
    const ordered = [...new Set(selected.poiIds.filter((id) => allowlist.has(id)))];
    if (!ordered.length) return fallback;
    return {
      poiIds: [...ordered, ...ids.filter((id) => !ordered.includes(id))],
      source: selected.source === 'gemini' ? 'gemini' : 'fallback',
    };
  } catch {
    // Curation is optional: reserved provider failures still count toward the shared spending limit.
    return fallback;
  }
}

import type { Firestore } from 'firebase-admin/firestore';
import {
  DEFAULT_TEMPLATES,
  fallbackTourConcept,
  encodePolyline,
  PoiSchema,
  TourConceptSchema,
  TourSchema,
  acceptSuggestedOrder,
  budgetDecision,
  hasMarkup,
  pickFreeTourId,
  prepareTour,
  simplifyPath,
  solveTour,
  stopOverlap,
  themesOf,
  tourId,
  tourSystemPrompt,
  tourUserPrompt,
  type AiConfig,
  type GenerateToursResult,
  type Poi,
  type PreparedTour,
  type RoutingProfile,
  type Tour,
  type TourConcept,
  type TourConceptInput,
  type TourPlan,
  type TourTemplate,
  type TravelMatrix,
} from '@tuur/shared';
import type { LlmProvider } from '../providers/llm';
import { CachedRoutingProvider, type RoutingProvider } from '../providers/routing';
import { loadAiConfig } from '../util/aiConfig';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';
import { logUsage, spentToday } from '../util/usage';

export interface TourDeps {
  db: Firestore;
  llm: LlmProvider;
  routing: RoutingProvider;
  now: () => number;
  templates?: TourTemplate[];
  config?: () => Promise<AiConfig>;
  /** Entitlement check for paid dynamic modes (planned route); throws to deny. */
  authorize?: (uid: string, req: { mode: 'planned'; tile: string }) => Promise<void>;
  /** Best-effort pre-generation of the first stop narrations (cost brake, spec 4.3). */
  pregenerate?: (poiIds: string[], lang: string) => Promise<void>;
}

export class TourError extends Error {
  constructor(
    readonly code:
      'failed-precondition' | 'resource-exhausted' | 'unavailable' | 'invalid-argument' | 'not-found',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const LOCK_TTL_MS = 5 * 60_000;
const STALE_MS = 30 * 24 * 3600_000;

/** POIs of all ready tiles that belong to a place. */
async function loadPlacePois(db: Firestore, placeId: string): Promise<Poi[]> {
  const areas = await db.collection('areas').where('placeId', '==', placeId).get();
  const tiles = areas.docs
    .filter((d) => ['ready', 'low_content'].includes(d.get('status') as string))
    .map((d) => d.id);
  const pois: Poi[] = [];
  for (let i = 0; i < tiles.length; i += 30) {
    const snap = await db
      .collection('pois')
      .where('tile', 'in', tiles.slice(i, i + 30))
      .get();
    for (const d of snap.docs) {
      const p = PoiSchema.safeParse(d.data());
      if (p.success) pois.push(p.data);
    }
  }
  return pois;
}

const fingerprint = (stops: Poi[]) => stops.map((s) => `${s.id}:${s.score}`).join('|');

export const kindOf = (p: Poi) =>
  p.osmTags['tourism'] ??
  p.osmTags['historic'] ??
  p.osmTags['amenity'] ??
  p.osmTags['leisure'] ??
  p.primaryInterest ??
  'place';

export function conceptInput(
  place: string,
  tour: {
    template: string;
    durationMinutes: number;
    themes: string[];
    stops: { poiId: string; name: string; walkMinutesFromPrev: number; kind?: string }[];
  },
  lang: string,
): TourConceptInput {
  return {
    lang,
    templateId: tour.template,
    durationMinutes: Math.round(tour.durationMinutes),
    placeName: place,
    themes: tour.themes,
    stops: tour.stops.map((s) => ({
      id: s.poiId,
      name: s.name,
      kind: s.kind ?? 'place',
      walkMinutesFromPrev: s.walkMinutesFromPrev,
    })),
  };
}

/** Validates model output: consistent hand-overs, spoken language only; otherwise a safe fact-free fallback is used. */
export function sanitizeConcept(c: TourConcept, input: TourConceptInput): TourConcept {
  const ids = input.stops.map((s) => s.id);
  const fields = [c.title, c.teaser, c.description, c.intro, c.outro, ...c.transitions.map((t) => t.text)];
  if (fields.some((f) => hasMarkup(f))) return fallbackTourConcept(input);
  const pair = new Map(c.transitions.map((t) => [`${t.fromPoiId}>${t.toPoiId}`, t.text]));
  const transitions = ids.slice(1).flatMap((to, n) => {
    const text = pair.get(`${ids[n]}>${to}`);
    return text ? [{ fromPoiId: ids[n]!, toPoiId: to, text }] : [];
  });
  return { ...c, transitions };
}

export async function makeConcept(
  deps: TourDeps,
  cfg: AiConfig,
  input: TourConceptInput,
  tile: string,
): Promise<TourConcept> {
  let concept: TourConcept | undefined;
  for (let attempt = 0; attempt < 2 && !concept; attempt++) {
    try {
      const r = await deps.llm.generateTourConcept({
        model: cfg.models.narration,
        system: tourSystemPrompt(input.lang),
        user: tourUserPrompt(input),
        input,
      });
      await logUsage(
        deps.db,
        cfg.pricing,
        {
          kind: 'narration',
          model: cfg.models.narration,
          usage: r.usage,
          tile,
          ok: true,
          note: 'tour_concept',
        },
        deps.now(),
      );
      const parsed = TourConceptSchema.safeParse(r.output);
      if (parsed.success) concept = sanitizeConcept(parsed.data, input);
    } catch {
      // retry once, then fall back
    }
  }
  return concept ?? fallbackTourConcept(input);
}

type Built = { tour: Tour } | { rejected: string[] };

async function buildTour(
  deps: TourDeps,
  cfg: AiConfig,
  place: { id: string; name: string },
  prep: PreparedTour,
  profile: RoutingProfile,
  lang: string,
  existing: Tour | undefined,
): Promise<Built> {
  const routing = new CachedRoutingProvider(deps.routing, deps.db, deps.now);
  const matrix: TravelMatrix = await routing.matrix(prep.matrixPoints, profile);
  let plan: TourPlan = solveTour(prep, matrix, { profile });
  if (plan.issues.length) return { rejected: plan.issues };

  const stopInfo = (p: TourPlan) =>
    p.stops.map((s, i) => ({
      poiId: s.id,
      name: s.name,
      walkMinutesFromPrev: i === 0 ? 0 : p.legMinutes[i]!,
      kind: kindOf(s),
    }));
  const themes = themesOf(plan.stops);
  let input = conceptInput(
    place.name,
    { template: prep.template.id, durationMinutes: plan.result.totalMinutes, themes, stops: stopInfo(plan) },
    lang,
  );
  let concept = await makeConcept(deps, cfg, input, plan.stops[0]!.tile);

  // The model may propose a better narrative order; the optimizer re-checks time and legs (spec 4.3).
  const revised = acceptSuggestedOrder(prep, matrix, plan, concept.suggestedOrder, { profile });
  if (revised !== plan) {
    plan = revised;
    input = conceptInput(
      place.name,
      {
        template: prep.template.id,
        durationMinutes: plan.result.totalMinutes,
        themes,
        stops: stopInfo(plan),
      },
      lang,
    );
    concept = sanitizeConcept(concept, input);
  }
  const { suggestedOrder: _dropped, ...text } = concept;
  void _dropped;

  const dir = await routing.directions(
    plan.stops.map((s) => s.location),
    profile,
  );
  if (routing.upstreamCalls) {
    await logUsage(
      deps.db,
      cfg.pricing,
      {
        kind: 'routing',
        usage: { routingCalls: routing.upstreamCalls },
        tile: plan.stops[0]!.tile,
        ok: true,
      },
      deps.now(),
    );
  }

  const now = deps.now();
  const cover = plan.stops.flatMap((s) => s.imageRefs)[0];
  const fp = fingerprint(plan.stops);
  const changed = !existing || existing.fingerprint !== fp;
  const tour: Tour = TourSchema.parse({
    id: tourId(place.id, prep.template.id),
    placeId: place.id,
    placeName: place.name,
    source: 'auto',
    version: existing ? existing.version + (changed ? 1 : 0) : 1,
    template: prep.template.id,
    profile,
    themes,
    stops: plan.stops.map((s, i) => ({
      poiId: s.id,
      order: i,
      name: s.name,
      location: s.location,
      dwellMinutes: s.dwellMinutes,
      walkMinutesFromPrev: i === 0 ? 0 : Math.round(plan.legMinutes[i]! * 10) / 10,
      partner: Boolean(s.partnerId),
    })),
    path: encodePolyline(simplifyPath(dir.path, 400)),
    durationMinutes: plan.result.totalMinutes,
    walkMinutes: plan.result.walkMinutes,
    distanceMeters: Math.round(dir.meters || plan.distanceMeters),
    bbox: plan.bbox,
    routingSource: routing.source,
    fingerprint: fp,
    free: existing?.free ?? false,
    locked: existing?.locked ?? false,
    pinned: existing?.pinned ?? false,
    hasPartner: plan.stops.some((s) => s.partnerId),
    ...(cover
      ? {
          coverImage: {
            url: cover.thumbUrl ?? cover.url,
            ...(cover.author ? { author: cover.author } : {}),
            license: cover.license,
            ...(cover.licenseUrl ? { licenseUrl: cover.licenseUrl } : {}),
            sourceUrl: cover.sourceUrl,
          },
        }
      : {}),
    texts: { ...(existing?.texts ?? {}), [lang]: text },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  return { tour };
}

export type GenerateResult = GenerateToursResult;

const summarize = (ts: Tour[]): GenerateResult['tours'] =>
  ts.map((t) => ({ id: t.id, template: t.template, durationMinutes: t.durationMinutes, free: t.free }));

/**
 * generateAutoTours (spec 4.3): on demand for a ready place, deduplicated by a lock. Existing edited/pinned/locked
 * tours are never overwritten; fresh auto tours are reused and only get texts in the requested language.
 */
export async function generateAutoTours(
  deps: TourDeps,
  uid: string,
  input: { tile: string; lang: string; profile?: RoutingProfile; force?: boolean },
): Promise<GenerateResult> {
  const cfg = await (deps.config ?? (() => loadAiConfig(deps.db, deps.now())))();
  const area = await deps.db.collection('areas').doc(input.tile).get();
  const placeId = area.get('placeId') as string | undefined;
  if (!area.exists || !placeId || !['ready', 'low_content'].includes(area.get('status') as string))
    return { status: 'area_not_ready', tours: [] };
  const place = await deps.db.collection('places').doc(placeId).get();
  const placeName = (place.get('name') as string | undefined) ?? placeId;

  const existingSnap = await deps.db.collection('tours').where('placeId', '==', placeId).get();
  const existing = new Map(existingSnap.docs.map((d) => [d.id, TourSchema.parse(d.data())]));
  const fresh = [...existing.values()].filter(
    (t) => deps.now() - t.updatedAt < STALE_MS && t.routingSource !== 'approx',
  );

  if (existing.size > 0 && fresh.length > 0 && !input.force) {
    // Writing texts for a new language costs model calls: gate it like any other generation (limits, budget, kill switch).
    if ([...existing.values()].some((t) => !t.texts[input.lang])) {
      try {
        await consumeRateLimit(deps.db, `tours_user_${uid}`, 10, 3600_000, deps.now());
      } catch (e) {
        if (e instanceof RateLimitError)
          throw new TourError('resource-exhausted', 'Too many requests', { retryAfterMs: e.retryAfterMs });
        throw e;
      }
      const gate = budgetDecision(cfg, await spentToday(deps.db, input.tile, deps.now()));
      if (!gate.allowed) throw new TourError('unavailable', 'Generation is paused', { reason: gate.reason });
    }
    await ensureTexts(deps, cfg, [...existing.values()], placeName, input.lang);
    const all = (await deps.db.collection('tours').where('placeId', '==', placeId).get()).docs.map((d) =>
      TourSchema.parse(d.data()),
    );
    return { status: 'ready', placeId, tours: summarize(all) };
  }

  try {
    await consumeRateLimit(deps.db, `tours_user_${uid}`, 10, 3600_000, deps.now());
  } catch (e) {
    if (e instanceof RateLimitError)
      throw new TourError('resource-exhausted', 'Too many requests', { retryAfterMs: e.retryAfterMs });
    throw e;
  }
  const budget = budgetDecision(cfg, await spentToday(deps.db, input.tile, deps.now()));
  if (!budget.allowed) throw new TourError('unavailable', 'Generation is paused', { reason: budget.reason });

  const lockRef = deps.db.collection('tourGeneration').doc(placeId);
  const got = await deps.db.runTransaction(async (tx) => {
    const s = await tx.get(lockRef);
    if (s.exists && deps.now() - Number(s.get('at')) < LOCK_TTL_MS) return false;
    tx.set(lockRef, { at: deps.now() });
    return true;
  });
  if (!got) return { status: 'generating', placeId, tours: summarize([...existing.values()]) };

  try {
    // Re-check under the lock: another request may have finished generating between our read and the lock.
    if (!input.force) {
      const late = (await deps.db.collection('tours').where('placeId', '==', placeId).get()).docs.map((d) =>
        TourSchema.parse(d.data()),
      );
      if (late.some((t) => deps.now() - t.updatedAt < STALE_MS && t.routingSource !== 'approx')) {
        await ensureTexts(deps, cfg, late, placeName, input.lang);
        return { status: 'ready', placeId, tours: summarize(late) };
      }
    }
    const pois = await loadPlacePois(deps.db, placeId);
    const profile = input.profile ?? 'foot-walking';
    const kept: Tour[] = [];
    for (const template of deps.templates ?? DEFAULT_TEMPLATES) {
      const prev = existing.get(tourId(placeId, template.id));
      if (prev && (prev.source === 'edited' || prev.pinned || prev.locked)) {
        kept.push(prev);
        continue;
      }
      const prep = prepareTour(pois, template, { profile });
      if (!prep) continue;
      const built = await buildTour(
        deps,
        cfg,
        { id: placeId, name: placeName },
        prep,
        profile,
        input.lang,
        prev,
      );
      if (!('tour' in built)) continue;
      const stopIds = built.tour.stops.map((s) => s.poiId);
      if (
        kept.some(
          (k) =>
            stopOverlap(
              k.stops.map((s) => s.poiId),
              stopIds,
            ) >= 0.8,
        )
      )
        continue;
      kept.push(built.tour);
    }
    const freeId = pickFreeTourId(kept);
    const finals = kept.map((t) => ({ ...t, free: t.id === freeId }));
    const batch = deps.db.batch();
    for (const t of finals) {
      batch.set(deps.db.collection('tours').doc(t.id), t);
      const prev = existing.get(t.id);
      if (prev && prev.version !== t.version)
        batch.set(deps.db.collection('tourVersions').doc(`${t.id}_${prev.version}`), prev);
    }
    // Templates that no longer yield a valid tour disappear unless an admin edited/pinned/locked them.
    for (const [id, t] of existing) {
      if (!finals.some((k) => k.id === id) && t.source === 'auto' && !t.pinned && !t.locked)
        batch.delete(deps.db.collection('tours').doc(id));
    }
    await batch.commit();

    const first = finals.find((t) => t.free) ?? finals[0];
    if (first && deps.pregenerate)
      await deps
        .pregenerate(
          first.stops.slice(0, 2).map((s) => s.poiId),
          input.lang,
        )
        .catch(() => undefined);
    return { status: finals.length ? 'ready' : 'no_tours', placeId, tours: summarize(finals) };
  } finally {
    await lockRef.delete().catch(() => undefined);
  }
}

/** Adds texts in `lang` to tours that lack them (one model call per tour, no re-planning). */
async function ensureTexts(
  deps: TourDeps,
  cfg: AiConfig,
  tours: Tour[],
  placeName: string,
  lang: string,
): Promise<void> {
  await Promise.all(
    tours
      .filter((t) => !t.texts[lang])
      .map(async (t) => {
        const input = conceptInput(
          placeName,
          { template: t.template, durationMinutes: t.durationMinutes, themes: t.themes, stops: t.stops },
          lang,
        );
        const c = await makeConcept(deps, cfg, input, t.placeId);
        const { suggestedOrder: _s, ...text } = c;
        void _s;
        await deps.db
          .collection('tours')
          .doc(t.id)
          .set({ texts: { [lang]: text } }, { merge: true });
      }),
  );
}

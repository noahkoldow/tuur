import {
  ComposeRouteRequestSchema,
  PoiSchema,
  TourSchema,
  budgetDecision,
  encodePolyline,
  evaluateOrder,
  fitToBudget,
  simplifyPath,
  themesOf,
  type LatLng,
  type Poi,
  type Tour,
  type TourConcept,
} from '@tuur/shared';
import { CachedRoutingProvider } from '../providers/routing';
import { loadAiConfig } from '../util/aiConfig';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';
import { logUsage, spentToday } from '../util/usage';
import { TourError, conceptInput, kindOf, makeConcept, type TourDeps } from './service';

/**
 * composePlannedRoute (spec 5.2): re-checks the client-planned route with real routing times, drops the least
 * valuable stops if the budget would be exceeded, adds the narrative thread and stores it as a private session.
 * Start/end coordinates are only used for routing and are never persisted.
 */
export async function composePlannedRoute(
  deps: TourDeps,
  uid: string,
  raw: unknown,
): Promise<{ tour: Tour; dropped: string[] }> {
  const parsed = ComposeRouteRequestSchema.safeParse(raw);
  if (!parsed.success) throw new TourError('invalid-argument', 'Invalid route request');
  const req = parsed.data;
  const cfg = await (deps.config ?? (() => loadAiConfig(deps.db, deps.now())))();

  const snaps = await Promise.all(req.stops.map((id) => deps.db.collection('pois').doc(id).get()));
  const pois: Poi[] = [];
  for (const s of snaps) {
    const p = s.exists ? PoiSchema.safeParse(s.data()) : undefined;
    if (!p?.success || p.data.hidden || !p.data.accessible)
      throw new TourError('not-found', 'Unknown or unavailable stop');
    pois.push(p.data);
  }
  if (new Set(req.stops).size !== req.stops.length)
    throw new TourError('invalid-argument', 'Duplicate stops');

  try {
    await consumeRateLimit(deps.db, `route_user_${uid}`, 20, 3600_000, deps.now());
  } catch (e) {
    if (e instanceof RateLimitError)
      throw new TourError('resource-exhausted', 'Too many requests', { retryAfterMs: e.retryAfterMs });
    throw e;
  }
  const tile = pois[0]!.tile;
  const budget = budgetDecision(cfg, await spentToday(deps.db, tile, deps.now()));
  if (!budget.allowed) throw new TourError('unavailable', 'Generation is paused', { reason: budget.reason });

  const routing = new CachedRoutingProvider(deps.routing, deps.db, deps.now);
  const startPt: LatLng = req.start ?? pois[0]!.location;
  const endPt: LatLng = req.end ?? (req.roundTrip ? startPt : pois[pois.length - 1]!.location);
  const points = [startPt, ...pois.map((p) => p.location), endPt];
  const m = await routing.matrix(points, req.profile);
  // Open routes: nothing to walk after the last stop.
  const open = !req.end && !req.roundTrip;
  const zeroEnd = (rows: number[][]) => rows.map((row) => row.map((v, j) => (j === row.length - 1 ? 0 : v)));
  const withOpenEnd = open ? zeroEnd(m.minutes) : m.minutes;
  // Without a start position the tour begins at its first stop: nothing to walk to reach it.
  const minutes = req.start ? withOpenEnd : withOpenEnd.map((row, i) => (i === 0 ? row.map(() => 0) : row));
  const fit = fitToBudget(pois, { minutes, meters: m.meters }, req.budgetMinutes, req.interests);
  const kept = fit.order.map((id) => pois.find((p) => p.id === id)!);
  if (kept.length === 0 || fit.totalMinutes > req.budgetMinutes + 0.5)
    throw new TourError('failed-precondition', 'No stops fit the time budget');

  const ev = evaluateOrder(
    {
      candidates: pois.map((p) => ({
        id: p.id,
        location: p.location,
        score: p.score,
        dwellMinutes: p.dwellMinutes,
        interests: p.interests,
      })),
      minutes,
    },
    fit.order,
  );
  const dirPoints = [
    ...(req.start ? [req.start] : []),
    ...kept.map((p) => p.location),
    ...(req.end ? [req.end] : req.roundTrip ? [startPt] : []),
  ];
  const dir =
    dirPoints.length > 1
      ? await routing.directions(dirPoints, req.profile)
      : { path: dirPoints.map((p) => [p.lat, p.lng] as [number, number]), meters: 0, minutes: 0 };
  if (routing.upstreamCalls)
    await logUsage(
      deps.db,
      cfg.pricing,
      { kind: 'routing', usage: { routingCalls: routing.upstreamCalls }, tile, ok: true },
      deps.now(),
    );

  // walking minutes per stop (from the previous point)
  const idxOf = new Map(pois.map((p, i) => [p.id, i + 1]));
  const legs: number[] = [];
  let prev = 0;
  for (const p of kept) {
    const n = idxOf.get(p.id)!;
    legs.push(minutes[prev]![n]!);
    prev = n;
  }
  const areaDoc = await deps.db.collection('areas').doc(tile).get();
  const placeId = (areaDoc.get('placeId') as string | undefined) ?? 'planned';
  const placeName =
    ((await deps.db.collection('places').doc(placeId).get()).get('name') as string | undefined) ?? placeId;
  const themes = themesOf(kept);
  const stopInfo = kept.map((p, i) => ({
    poiId: p.id,
    name: p.name,
    walkMinutesFromPrev: i === 0 ? 0 : legs[i]!,
    kind: kindOf(p),
  }));
  const input = conceptInput(
    placeName,
    { template: 'planned', durationMinutes: ev?.totalMinutes ?? req.budgetMinutes, themes, stops: stopInfo },
    req.lang,
  );
  const concept = await makeConcept(deps, cfg, input, tile);
  const { suggestedOrder: _ignored, ...text } = concept as TourConcept;
  void _ignored;

  const now = deps.now();
  const sessionRef = deps.db.collection('users').doc(uid).collection('sessions').doc();
  const lats = kept.map((p) => p.location.lat);
  const lngs = kept.map((p) => p.location.lng);
  const cover = kept.flatMap((s) => s.imageRefs)[0];
  const tour: Tour = TourSchema.parse({
    id: `planned_${sessionRef.id}`,
    placeId,
    placeName,
    source: 'planned',
    version: 1,
    template: 'planned',
    profile: req.profile,
    themes,
    stops: kept.map((p, i) => ({
      poiId: p.id,
      order: i,
      name: p.name,
      location: p.location,
      dwellMinutes: p.dwellMinutes,
      walkMinutesFromPrev: i === 0 ? 0 : Math.round(legs[i]! * 10) / 10,
      partner: Boolean(p.partnerId),
    })),
    path: encodePolyline(simplifyPath(dir.path, 400)),
    durationMinutes: ev?.totalMinutes ?? req.budgetMinutes,
    walkMinutes: ev?.walkMinutes ?? 0,
    distanceMeters: Math.round(dir.meters),
    bbox: {
      south: Math.min(...lats),
      north: Math.max(...lats),
      west: Math.min(...lngs),
      east: Math.max(...lngs),
    },
    routingSource: routing.source,
    fingerprint: kept.map((p) => p.id).join('|'),
    hasPartner: kept.some((p) => p.partnerId),
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
    texts: { [req.lang]: text },
    createdAt: now,
    updatedAt: now,
  });
  await sessionRef.set({ ...tour, kind: 'planned', expiresAt: now + 24 * 3600_000 });
  return { tour, dropped: fit.dropped };
}

import type { Firestore } from 'firebase-admin/firestore';
import {
  GetWalkingRouteRequestSchema,
  PoiSchema,
  WalkingRouteResultSchema,
  distanceMeters,
  encodeGeohash,
  type AiConfig,
  type WalkingRouteResult,
} from '@tuur/shared';
import { BetaSnapshotError, ensureBetaSnapshotArea } from '../area/betaSnapshot';
import { budgetedRouting } from '../providers/budgeted';
import { CachedRoutingProvider, type RoutingProvider } from '../providers/routing';
import { loadAiConfig } from '../util/aiConfig';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';

export interface NavigationDeps {
  db: Firestore;
  routing: RoutingProvider;
  now: () => number;
  config?: () => Promise<AiConfig>;
  env?: Record<string, string | undefined>;
}

export class NavigationError extends Error {
  constructor(
    readonly code: 'invalid-argument' | 'not-found' | 'failed-precondition' | 'resource-exhausted',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** GPS fixes are used only for this provider request, never written to a cache, account, or usage log. */
export async function getWalkingRoute(
  deps: NavigationDeps,
  uid: string,
  raw: unknown,
): Promise<WalkingRouteResult> {
  const parsed = GetWalkingRouteRequestSchema.safeParse(raw);
  if (!parsed.success) throw new NavigationError('invalid-argument', 'Invalid navigation request');
  const req = parsed.data;
  try {
    await consumeRateLimit(deps.db, `navigation_minute_${uid}`, 12, 60_000, deps.now());
    await consumeRateLimit(deps.db, `navigation_hour_${uid}`, 120, 3600_000, deps.now());
  } catch (error) {
    if (error instanceof RateLimitError)
      throw new NavigationError('resource-exhausted', 'Too many route requests', {
        retryAfterMs: error.retryAfterMs,
      });
    throw error;
  }

  let destination = req.destination;
  if (req.poiId) {
    const snap = await deps.db.collection('pois').doc(req.poiId).get();
    const poi = snap.exists ? PoiSchema.safeParse(snap.data()) : undefined;
    if (!poi?.success || poi.data.id !== req.poiId || poi.data.hidden || !poi.data.accessible)
      throw new NavigationError('not-found', 'Unknown or unavailable destination');
    destination = poi.data.location;
  }
  // Exactly one target is required by the schema, including non-POI pause stops and planned endpoints.
  if (!destination || distanceMeters(req.origin, destination) > 10_000)
    throw new NavigationError('invalid-argument', 'Navigation destinations must be within 10 km');
  const tile = encodeGeohash(destination.lat, destination.lng, 6);
  const originTile = encodeGeohash(req.origin.lat, req.origin.lng, 6);
  try {
    for (const candidate of new Set([tile, originTile]))
      await ensureBetaSnapshotArea(deps.db, candidate, false, undefined, deps.env ?? process.env);
  } catch (error) {
    if (error instanceof BetaSnapshotError)
      throw new NavigationError('failed-precondition', error.message, { reason: error.reason });
    throw error;
  }

  const cfg = await (deps.config ?? (() => loadAiConfig(deps.db, deps.now())))();
  const routing = new CachedRoutingProvider(
    budgetedRouting(deps.routing, deps.db, cfg, deps.now, tile),
    deps.db,
    deps.now,
    undefined,
    false,
  );
  const route = await routing.directions([req.origin, destination], req.profile);
  const [lat, lng] = route.path[0]!;
  return WalkingRouteResultSchema.parse({
    ...(req.poiId ? { poiId: req.poiId } : {}),
    origin: { lat, lng },
    destination,
    profile: req.profile,
    path: route.path,
    distanceMeters: Math.round(route.meters),
    durationSeconds: Math.round(route.minutes * 60),
    routingSource: routing.source,
  });
}

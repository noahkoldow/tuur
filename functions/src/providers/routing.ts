import type { Firestore } from 'firebase-admin/firestore';
import {
  haversineMatrix,
  matrixCacheKey,
  type LatLng,
  type RoutingProfile,
  type TravelMatrix,
} from '@tuur/shared';
import { fetchJson } from '../util/http';
import { z } from 'zod';
import { BudgetError } from '../util/usage';

export interface Directions {
  /** [lat, lng] pairs */
  path: [number, number][];
  meters: number;
  minutes: number;
}

const DirectionsSchema = z.object({
  path: z
    .array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
    .min(2)
    .max(20_000),
  meters: z.number().finite().nonnegative(),
  minutes: z.number().finite().nonnegative(),
});

export class RoutingUnavailableError extends Error {
  readonly code = 'unavailable';
  readonly details = { reason: 'routing_unavailable' };
  constructor() {
    super('A route along streets and paths is currently unavailable');
  }
}

export type RoutingSource = 'ors' | 'approx' | 'mock';

export interface RoutingProvider {
  readonly source: RoutingSource;
  matrix(points: LatLng[], profile: RoutingProfile): Promise<TravelMatrix>;
  directions(points: LatLng[], profile: RoutingProfile): Promise<Directions>;
}

/** Offline provider: haversine matrix and straight-line paths. */
export class MockRoutingProvider implements RoutingProvider {
  readonly source: RoutingSource = 'mock';
  async matrix(points: LatLng[], profile: RoutingProfile) {
    return haversineMatrix(points, profile);
  }
  async directions(points: LatLng[], profile: RoutingProfile): Promise<Directions> {
    const m = haversineMatrix(points, profile);
    let meters = 0;
    let minutes = 0;
    for (let i = 0; i < points.length - 1; i++) {
      meters += m.meters[i]![i + 1]!;
      minutes += m.minutes[i]![i + 1]!;
    }
    return { path: points.map((p) => [p.lat, p.lng] as [number, number]), meters, minutes };
  }
}

interface OrsMatrixResponse {
  durations: (number | null)[][];
  distances: (number | null)[][];
}
interface OrsDirectionsResponse {
  features: {
    geometry: { coordinates: [number, number][] };
    properties: { summary: { distance: number; duration: number } };
  }[];
}

/** OpenRouteService. Keys stay server side (this runs in Cloud Functions, spec 3 "Routing"). */
export class OrsRoutingProvider implements RoutingProvider {
  readonly source: RoutingSource = 'ors';
  private readonly baseUrl: string;
  constructor(
    private readonly apiKey: string,
    // HeiGIT's gateway includes the service prefix; self-hosted instances can override ORS_URL.
    baseUrl = process.env['ORS_URL'] ?? 'https://api.heigit.org/openrouteservice',
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private headers() {
    return { Authorization: this.apiKey, 'Content-Type': 'application/json' };
  }

  async matrix(points: LatLng[], profile: RoutingProfile): Promise<TravelMatrix> {
    const json = await fetchJson<OrsMatrixResponse>(`${this.baseUrl}/v2/matrix/${profile}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        locations: points.map((p) => [p.lng, p.lat]),
        metrics: ['duration', 'distance'],
      }),
      retries: 0, // Each upstream attempt must have its own budget reservation.
    });
    const fallback = haversineMatrix(points, profile);
    // Unroutable pairs come back as null: fall back to the straight-line estimate for that pair.
    const minutes = json.durations.map((row, i) =>
      row.map((v, j) => (v == null ? fallback.minutes[i]![j]! : Math.round((v / 60) * 100) / 100)),
    );
    const meters = json.distances.map((row, i) =>
      row.map((v, j) => (v == null ? fallback.meters[i]![j]! : Math.round(v))),
    );
    return { minutes, meters };
  }

  async directions(points: LatLng[], profile: RoutingProfile): Promise<Directions> {
    const json = await fetchJson<OrsDirectionsResponse>(`${this.baseUrl}/v2/directions/${profile}/geojson`, {
      method: 'POST',
      // The GeoJSON endpoint rejects Accept: application/json with HTTP 406.
      headers: { ...this.headers(), Accept: 'application/geo+json' },
      body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]), instructions: false }),
      retries: 0,
    });
    const f = json.features[0];
    if (!f) throw new Error('ORS returned no route');
    return DirectionsSchema.parse({
      path: f.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      meters: f.properties.summary.distance,
      minutes: f.properties.summary.duration / 60,
    });
  }
}

/**
 * Caches provider results for 30 days. Matrix estimates may degrade, but route geometry must come
 * from the configured provider: unavailable directions never become straight-line navigation.
 */
export class CachedRoutingProvider implements RoutingProvider {
  private used: RoutingSource;
  /** Number of upstream calls made (for usage logging). */
  upstreamCalls = 0;
  constructor(
    private readonly inner: RoutingProvider,
    private readonly db: Firestore,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 30 * 24 * 3600_000,
    private readonly cacheDirections = true,
  ) {
    this.used = inner.source;
  }
  get source(): RoutingSource {
    return this.used;
  }

  async matrix(points: LatLng[], profile: RoutingProfile): Promise<TravelMatrix> {
    const ref = this.db
      .collection('routingCache')
      .doc(`m_${this.inner.source}_${matrixCacheKey(points, profile)}`);
    const hit = await ref.get();
    if (hit.exists && Number(hit.get('expiresAt')) > this.now()) {
      return JSON.parse(hit.get('data') as string) as TravelMatrix;
    }
    try {
      this.upstreamCalls++;
      const m = await this.inner.matrix(points, profile);
      await ref.set({
        data: JSON.stringify(m),
        expiresAt: this.now() + this.ttlMs,
        expireAt: new Date(this.now() + this.ttlMs),
      });
      return m;
    } catch (error) {
      if (error instanceof BudgetError) throw error;
      this.used = 'approx';
      return haversineMatrix(points, profile);
    }
  }

  async directions(points: LatLng[], profile: RoutingProfile): Promise<Directions> {
    // Navigation origins stay transient; ordinary tour routes retain their provider-separated cache.
    const ref = this.cacheDirections
      ? this.db.collection('routingCache').doc(`d_${this.inner.source}_${matrixCacheKey(points, profile)}`)
      : undefined;
    const hit = await ref?.get();
    if (hit?.exists && Number(hit.get('expiresAt')) > this.now()) {
      try {
        return DirectionsSchema.parse(JSON.parse(hit.get('data') as string));
      } catch {
        // Discard malformed/old data and re-fetch a validated route.
      }
    }
    try {
      this.upstreamCalls++;
      const d = DirectionsSchema.parse(await this.inner.directions(points, profile));
      await ref?.set({
        data: JSON.stringify(d),
        expiresAt: this.now() + this.ttlMs,
        expireAt: new Date(this.now() + this.ttlMs),
      });
      return d;
    } catch (error) {
      if (error instanceof BudgetError) throw error;
      throw new RoutingUnavailableError();
    }
  }
}

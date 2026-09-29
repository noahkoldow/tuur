import type { Firestore } from 'firebase-admin/firestore';
import {
  haversineMatrix,
  matrixCacheKey,
  type LatLng,
  type RoutingProfile,
  type TravelMatrix,
} from '@tuur/shared';
import { fetchJson } from '../util/http';

export interface Directions {
  /** [lat, lng] pairs */
  path: [number, number][];
  meters: number;
  minutes: number;
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
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = process.env['ORS_URL'] ?? 'https://api.openrouteservice.org',
  ) {}

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
      retries: 1,
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
      headers: this.headers(),
      body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]), instructions: false }),
      retries: 1,
    });
    const f = json.features[0];
    if (!f) throw new Error('ORS returned no route');
    return {
      path: f.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      meters: f.properties.summary.distance,
      minutes: f.properties.summary.duration / 60,
    };
  }
}

/**
 * Wraps a provider with a Firestore cache (matrices and directions rarely change; 30 days) and degrades to
 * offline estimates if the upstream service fails, reporting `approx` so callers can flag the result.
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
  ) {
    this.used = inner.source;
  }
  get source(): RoutingSource {
    return this.used;
  }

  async matrix(points: LatLng[], profile: RoutingProfile): Promise<TravelMatrix> {
    const ref = this.db.collection('routingCache').doc(`m_${matrixCacheKey(points, profile)}`);
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
    } catch {
      this.used = 'approx';
      return haversineMatrix(points, profile);
    }
  }

  async directions(points: LatLng[], profile: RoutingProfile): Promise<Directions> {
    const ref = this.db.collection('routingCache').doc(`d_${matrixCacheKey(points, profile)}`);
    const hit = await ref.get();
    if (hit.exists && Number(hit.get('expiresAt')) > this.now())
      return JSON.parse(hit.get('data') as string) as Directions;
    try {
      this.upstreamCalls++;
      const d = await this.inner.directions(points, profile);
      await ref.set({
        data: JSON.stringify(d),
        expiresAt: this.now() + this.ttlMs,
        expireAt: new Date(this.now() + this.ttlMs),
      });
      return d;
    } catch {
      this.used = 'approx';
      return new MockRoutingProvider().directions(points, profile);
    }
  }
}

import { rateLimitDecision, type LatLng } from '@tuur/shared';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { fetchJson, HttpError } from '../util/http';
import { RateLimitError } from '../util/rateLimit';
import { countryCodeAlpha2 } from './countryCodes';
import type { GeocodeResult, GeocodingProvider } from './geocoding';

const DAY_MS = 86_400_000;
const placeLayers = ['locality', 'localadmin', 'county', 'region'];
const responseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z
    .array(
      z.object({
        type: z.literal('Feature'),
        properties: z.object({
          layer: z.string(),
          name: z.string().optional(),
          locality: z.string().optional(),
          localadmin: z.string().optional(),
          county: z.string().optional(),
          region: z.string().optional(),
          country: z.string().optional(),
          country_a: z.string(),
        }),
      }),
    )
    .max(1),
});

/** An unspecified provider quota may be the daily limit, including usage by other apps sharing the key. */
function quotaRetryAfterMs(header: string | null, now = Date.now()): number {
  const value = header?.trim();
  if (!value) return DAY_MS;
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) && delay >= 0 ? delay : DAY_MS;
}

/** Shared across workers. Below Standard's 100/min and 3000/day, including window-boundary headroom.
 * Other apps sharing the key can still exhaust upstream quota; 429 is surfaced without a retry/fallback.
 */
export async function reservePeliasRequest(db: Firestore, now = Date.now()): Promise<void> {
  const windows = [
    { key: 'heigit_pelias_day', limit: 1000, windowMs: DAY_MS },
    { key: 'heigit_pelias_minute', limit: 40, windowMs: 60_000 },
  ].map((rule) => ({ ...rule, ref: db.collection('rateLimits').doc(rule.key) }));
  await db.runTransaction(async (tx) => {
    const snapshots = await Promise.all(windows.map(({ ref }) => tx.get(ref)));
    const decisions = windows.map((rule, index) => {
      const snap = snapshots[index]!;
      return rateLimitDecision(
        snap.exists
          ? { windowStart: Number(snap.get('windowStart')), count: Number(snap.get('count')) }
          : undefined,
        now,
        rule,
      );
    });
    const rejected = decisions.filter((d) => !d.allowed);
    // A local rejection sends no upstream request, so neither window may consume quota.
    if (rejected.length) throw new RateLimitError(Math.max(...rejected.map((d) => d.retryAfterMs)));
    windows.forEach(({ ref, windowMs }, index) => {
      tx.set(ref, { ...decisions[index]!.next, expireAt: new Date(now + windowMs * 2) });
    });
  });
}

/** One coarse reverse lookup per area; the existing transactional area claim/TTL caches successful ingest.
 * https://github.com/pelias/documentation/blob/master/reverse.md
 * Only the tile centre is sent (no user identity or exact user position).
 */
export class PeliasGeocoder implements GeocodingProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    private readonly beforeRequest: () => Promise<void>,
    baseUrl = process.env['PELIAS_URL'] ?? 'https://api.heigit.org/pelias',
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async reverse(at: LatLng): Promise<GeocodeResult> {
    if (
      !Number.isFinite(at.lat) ||
      Math.abs(at.lat) > 90 ||
      !Number.isFinite(at.lng) ||
      Math.abs(at.lng) > 180
    )
      throw new Error('Pelias requires valid coordinates');
    const params = new URLSearchParams({
      'point.lat': String(at.lat),
      'point.lon': String(at.lng),
      layers: placeLayers.join(','),
      size: '1',
      lang: 'en',
    });
    await this.beforeRequest();
    let json: unknown;
    try {
      json = await fetchJson(`${this.baseUrl}/v1/reverse?${params}`, {
        headers: { Authorization: this.apiKey },
        retries: 0,
        timeoutMs: 15_000,
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 429)
        throw new RateLimitError(quotaRetryAfterMs(error.retryAfter));
      throw error;
    }
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) throw new Error('Pelias returned an invalid response');
    const p = parsed.data.features[0]?.properties;
    if (!p || !placeLayers.includes(p.layer)) throw new Error('Pelias returned no place');
    const name = [p.locality, p.localadmin, p.county, p.region, p.name].find((s) => s?.trim());
    const countryCode = countryCodeAlpha2(p.country_a);
    if (!name || !countryCode) throw new Error('Pelias returned no place or supported country code');
    return { name, countryCode, ...(p.country ? { country: p.country } : {}) };
  }
}

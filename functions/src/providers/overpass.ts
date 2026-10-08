import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { buildOverpassQuery, parseOverpass, type Bounds, type RawPoi } from '@tuur/shared';
import { z } from 'zod';
import { HttpError, USER_AGENT } from '../util/http';
import { RateLimitError } from '../util/rateLimit';

export const OVERPASS_DAILY_LIMIT = 1500;
export const OVERPASS_LEASE_MS = 90_000;
export const OVERPASS_MAX_BYTES = 4 * 1024 * 1024;
export const OVERSPAN_ENDPOINT = 'https://api.overspan.dev/api/interpreter';
const DAY_MS = 86_400_000;

export interface OverpassPermit {
  /** Call only after receiving a complete response. A transport timeout retains the expiring lease. */
  release(retryAfterMs?: number): Promise<void>;
}

/** Allowance shared by every worker: OVERPASS_DAILY_LIMIT actual attempts/day, one query in flight.
 * Stays well below the public instances' fair-use range (roughly 10,000 queries/day); each tile is fetched once and cached.
 * Failed network attempts count too; rejected local reservations do not. No quota refund or fallback.
 */
export async function reserveOverpassRequest(
  db: Firestore,
  now = Date.now(),
  clock: () => number = Date.now,
): Promise<OverpassPermit> {
  const ref = db.collection('rateLimits').doc('overpass_requests');
  const day = new Date(now).toISOString().slice(0, 10);
  const token = randomUUID();
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const blockedUntil = Math.max(
      Number(current.get('inFlightUntil') ?? 0),
      Number(current.get('blockedUntil') ?? 0),
    );
    if (blockedUntil > now) throw new RateLimitError(blockedUntil - now);
    const count = current.get('day') === day ? Number(current.get('count') ?? 0) : 0;
    if (count >= OVERPASS_DAILY_LIMIT)
      throw new RateLimitError(Date.parse(`${day}T00:00:00Z`) + DAY_MS - now);
    tx.set(ref, {
      day,
      count: count + 1,
      inFlightUntil: now + OVERPASS_LEASE_MS,
      token,
      expireAt: new Date(now + 2 * DAY_MS),
    });
  });
  return {
    release: async (retryAfterMs = 0) => {
      await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        // A late completion must not release a newer worker's lease after this one expired.
        if (current.get('token') !== token) return;
        tx.set(
          ref,
          {
            inFlightUntil: 0,
            token: null,
            blockedUntil: Math.max(Number(current.get('blockedUntil') ?? 0), clock() + retryAfterMs),
            expireAt: new Date(clock() + Math.max(2 * DAY_MS, retryAfterMs + DAY_MS)),
          },
          { merge: true },
        );
      });
    },
  };
}

export interface OverpassOptions {
  /** Server-only Overspan key, never included in the URL. */
  apiKey?: string;
  reserveRequest?: () => Promise<OverpassPermit>;
}

const point = { lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) };
const responseSchema = z.object({
  // Overpass may return HTTP 200 plus a remark after a partial timeout. Never cache it as a full area.
  remark: z.never().optional(),
  elements: z
    .array(
      z.object({
        type: z.enum(['node', 'way', 'relation']),
        id: z.number().int().nonnegative(),
        lat: point.lat.optional(),
        lon: point.lon.optional(),
        center: z.object(point).optional(),
        geometry: z.array(z.object(point).nullable()).optional(),
        tags: z.record(z.string()).optional(),
      }),
    )
    .max(2000),
});

async function boundedText(response: Response): Promise<string> {
  if (Number(response.headers.get('Content-Length')) > OVERPASS_MAX_BYTES) {
    await response.body?.cancel();
    throw new Error('Overpass response exceeds the byte limit');
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > OVERPASS_MAX_BYTES) throw new Error('Overpass response exceeds the byte limit');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function quotaDelay(response: Response, json: unknown, now: number): number {
  const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(json);
  if (error.success && error.data.error.code === 'quota_exceeded') {
    // Overspan's monthly error has Retry-After: 3600; its explicit quota reset is authoritative.
    const reset = Date.parse(response.headers.get('X-Overspan-Quota-Reset') ?? '');
    const date = new Date(now);
    return Number.isFinite(reset) && reset > now
      ? reset - now
      : Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - now;
  }
  const retry = response.headers.get('Retry-After')?.trim();
  if (!retry) return DAY_MS;
  const delay = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now;
  return Number.isFinite(delay) && delay >= 0 ? delay : DAY_MS;
}

/** Standard Overpass QL, preserving all OSM tags used by access checks, attribution and enrichment. */
export async function fetchOverpass(
  endpoint: string,
  bounds: Bounds,
  options: OverpassOptions = {},
): Promise<RawPoi[]> {
  const url = new URL(endpoint);
  const overspan = url.origin === 'https://api.overspan.dev';
  if (options.apiKey && (!overspan || endpoint !== OVERSPAN_ENDPOINT))
    throw new Error('The Overspan API key requires its canonical HTTPS endpoint');
  if (overspan && (!options.apiKey?.trim() || !options.reserveRequest))
    throw new Error('Overspan requires a server API key and shared request guard');
  const permit = await options.reserveRequest?.();
  let complete = false;
  let retryAfterMs = 0;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: new URLSearchParams({ data: buildOverpassQuery(bounds) }).toString(),
      signal: AbortSignal.timeout(70_000),
    });
    const text = await boundedText(response);
    complete = true;
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) throw new Error('Overpass returned invalid JSON');
    }
    if (response.status === 429) {
      retryAfterMs = quotaDelay(response, json, Date.now());
      throw new RateLimitError(retryAfterMs);
    }
    if (!response.ok) throw new HttpError(response.status, url.host, response.headers.get('Retry-After'));
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) throw new Error('Overpass returned incomplete or invalid POI data');
    return parseOverpass(parsed.data);
  } finally {
    if (complete) await permit?.release(retryAfterMs);
  }
}

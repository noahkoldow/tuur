import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { PoiStatsSchema, bumpHeat, explorerDaySeed } from '@tuur/shared';

export const RecordVisitSchema = z.object({ poiId: z.string().min(1).max(200) });

/** Marker docs only need to outlive their day; TTL (`expireAt`) removes them afterwards. */
const MARKER_TTL_MS = 2 * 86_400_000;

/**
 * Counts one anonymous "explorer day" for a POI when a listener arrives there (spec 10: aggregated, anonymous).
 * `poiStats/{poiId}` holds only counts; the dedup marker is a hash of user + POI + day, so the same person counts
 * once per spot and day and markers of different days or spots cannot be linked. No user id is stored.
 */
export async function recordVisit(
  deps: { db: Firestore; now: () => number },
  uid: string,
  raw: unknown,
): Promise<{ counted: boolean }> {
  const { poiId } = RecordVisitSchema.parse(raw);
  const now = deps.now();
  const marker = createHash('sha256')
    .update(explorerDaySeed(uid, poiId, now))
    .digest('hex')
    .slice(0, 40);
  const poiRef = deps.db.collection('pois').doc(poiId);
  const statsRef = deps.db.collection('poiStats').doc(poiId);
  const markerRef = deps.db.collection('explorerMarkers').doc(marker);
  return deps.db.runTransaction(async (tx) => {
    const [seen, poi, stats] = await Promise.all([tx.get(markerRef), tx.get(poiRef), tx.get(statsRef)]);
    if (seen.exists || !poi.exists || poi.get('hidden') === true) return { counted: false };
    const prev = stats.exists ? PoiStatsSchema.safeParse(stats.data()) : undefined;
    const p = prev?.success ? prev.data : undefined;
    tx.set(markerRef, { expireAt: Timestamp.fromMillis(now + MARKER_TTL_MS) });
    tx.set(statsRef, {
      poiId,
      tile: String(poi.get('tile')),
      explorers: (p?.explorers ?? 0) + 1,
      heat: bumpHeat(p, now),
      lastAt: now,
    });
    return { counted: true };
  });
}

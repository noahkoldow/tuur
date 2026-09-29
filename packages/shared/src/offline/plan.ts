import { z } from 'zod';
import { LENGTH_TIERS, type LengthTier } from '../constants';
import { expandBounds, type Bounds } from '../geo/geohash';
import { TourSchema, type Tour } from '../routing/tour';

/** Offline download of a tour (spec 4.8): map tiles, all narration audios (all tiers), texts, images. */
export type DownloadItemKind = 'narration' | 'transition' | 'image' | 'tiles';

export interface DownloadItem {
  id: string;
  kind: DownloadItemKind;
  poiId?: string;
  toPoiId?: string;
  tier?: LengthTier;
  /** Relative weight for the overall progress (audio dominates the size). */
  weight: number;
}

export const AUDIO_BYTES_PER_SECOND = 6_000; // 48 kbps MP3
export const TIER_SECONDS: Record<LengthTier, number> = { short: 30, medium: 90, long: 180 };

export const narrationItemId = (poiId: string, tier: LengthTier) => `narration:${poiId}:${tier}`;
export const transitionItemId = (from: string, to: string) => `transition:${from}:${to}`;

/** Everything needed for full offline use of a tour (images are added once the narrations are known). */
export function planDownload(
  tour: Tour,
  opts: { tiers?: LengthTier[]; transitions?: boolean; tiles?: boolean } = {},
): DownloadItem[] {
  const tiers = opts.tiers ?? [...LENGTH_TIERS];
  const items: DownloadItem[] = [];
  for (const s of tour.stops) {
    for (const t of tiers)
      items.push({
        id: narrationItemId(s.poiId, t),
        kind: 'narration',
        poiId: s.poiId,
        tier: t,
        weight: 2 + TIER_SECONDS[t] / 30,
      });
  }
  if (opts.transitions !== false) {
    for (let i = 1; i < tour.stops.length; i++) {
      items.push({
        id: transitionItemId(tour.stops[i - 1]!.poiId, tour.stops[i]!.poiId),
        kind: 'transition',
        poiId: tour.stops[i - 1]!.poiId,
        toPoiId: tour.stops[i]!.poiId,
        weight: 1,
      });
    }
  }
  if (opts.tiles !== false) items.push({ id: `tiles:${tour.id}`, kind: 'tiles', weight: 12 });
  return items;
}

/** Weighted overall progress 0..1 from per-item fractions (missing items count as 0). */
export function overallProgress(items: DownloadItem[], fractions: Record<string, number>): number {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total === 0) return 1;
  return Math.min(
    1,
    items.reduce((s, i) => s + i.weight * Math.max(0, Math.min(1, fractions[i.id] ?? 0)), 0) / total,
  );
}

/** Rough download size before starting (shown next to the button): audio for all tiers plus map tiles. */
export function estimateDownloadBytes(tour: Tour, opts: { tiers?: LengthTier[] } = {}): number {
  const tiers = opts.tiers ?? [...LENGTH_TIERS];
  const audio = tour.stops.length * tiers.reduce((s, t) => s + TIER_SECONDS[t] * AUDIO_BYTES_PER_SECOND, 0);
  const transitions = Math.max(0, tour.stops.length - 1) * 8 * AUDIO_BYTES_PER_SECOND;
  const images = tour.stops.length * 60_000;
  const tiles = 25_000_000 * Math.max(0.3, Math.min(2, mapAreaKm2(tour.bbox) / 4));
  return Math.round(audio + transitions + images + tiles);
}

function mapAreaKm2(b: Bounds): number {
  const h = (b.north - b.south) * 111.32;
  const w = (b.east - b.west) * 111.32 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
  return Math.max(0.2, h * w);
}

/** Tour bounding box plus buffer (spec 4.8), used for the offline map pack. */
export const offlineMapBounds = (tour: Tour, bufferM = 400): Bounds => expandBounds(tour.bbox, bufferM);

export const OfflineNarrationSchema = z.object({
  key: z.string(),
  title: z.string(),
  text: z.string(),
  paragraphs: z.array(z.object({ text: z.string(), startMs: z.number(), durationMs: z.number() })),
  keyFacts: z.array(z.string()).default([]),
  audioDurationMs: z.number(),
  /** Partner introduction: the label stays visible offline. */
  sponsored: z.boolean().default(false),
  /** Local file path of the audio. */
  audioFile: z.string(),
  images: z.array(
    z.object({
      url: z.string(),
      thumbUrl: z.string().optional(),
      author: z.string().optional(),
      license: z.string(),
      licenseUrl: z.string().optional(),
      sourceUrl: z.string(),
      localFile: z.string().optional(),
    }),
  ),
});
export type OfflineNarration = z.infer<typeof OfflineNarrationSchema>;

export const OfflineManifestSchema = z.object({
  version: z.literal(1),
  tourId: z.string(),
  lang: z.string(),
  tour: TourSchema,
  narrations: z.record(OfflineNarrationSchema),
  transitions: z.record(
    z.object({ key: z.string(), text: z.string(), audioFile: z.string(), audioDurationMs: z.number() }),
  ),
  mapPack: z.string().optional(),
  bytes: z.number().nonnegative(),
  createdAt: z.number(),
  /** Set when every planned item was stored; partial downloads never claim to work offline. */
  complete: z.boolean(),
});
export type OfflineManifest = z.infer<typeof OfflineManifestSchema>;

/** Which planned narrations are still missing from a manifest (for resuming). */
export function missingItems(
  items: DownloadItem[],
  m: Pick<OfflineManifest, 'narrations' | 'transitions'> | undefined,
): DownloadItem[] {
  if (!m) return items.filter((i) => i.kind !== 'tiles');
  return items.filter((i) => {
    if (i.kind === 'narration') return !m.narrations[`${i.poiId}:${i.tier}`];
    if (i.kind === 'transition') return !m.transitions[`${i.poiId}:${i.toPoiId}`];
    return false;
  });
}

/** Whether a manifest fully covers the tour: every stop has all tiers, and every hop a transition (if planned). */
export function coversTour(m: OfflineManifest, tour: Tour, tiers: LengthTier[] = [...LENGTH_TIERS]): boolean {
  return tour.stops.every((s) => tiers.every((t) => m.narrations[`${s.poiId}:${t}`]));
}

export const formatBytes = (n: number): string =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)} GB`
    : n >= 1e6
      ? `${Math.round(n / 1e6)} MB`
      : `${Math.max(1, Math.round(n / 1e3))} KB`;

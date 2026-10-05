import { describe, expect, it } from 'vitest';
import { REGION_FIXTURES } from '../fixtures/regions';
import { buildPois } from '../poi/pipeline';
import { planTour, DEFAULT_TEMPLATES } from '../routing/autoTours';
import { encodePolyline } from '../routing/polyline';
import type { Tour } from '../routing/tour';
import {
  coversTour,
  downloadTourMode,
  offlineAccessValid,
  estimateDownloadBytes,
  formatBytes,
  missingItems,
  narrationItemId,
  offlineMapBounds,
  overallProgress,
  planDownload,
  OfflineManifestSchema,
} from './plan';

const pois = buildPois(REGION_FIXTURES[0]!.raw, { now: 1 }).pois;
const plan = planTour(pois, DEFAULT_TEMPLATES[0]!)!.plan;
const tour: Tour = {
  id: 't1',
  placeId: 'DE_berlin',
  source: 'auto',
  version: 1,
  template: 'highlights60',
  profile: 'foot-walking',
  themes: [],
  stops: plan.stops.map((s, i) => ({
    poiId: s.id,
    order: i,
    name: s.name,
    location: s.location,
    dwellMinutes: 5,
    walkMinutesFromPrev: 3,
    partner: false,
  })),
  path: encodePolyline(plan.stops.map((s) => [s.location.lat, s.location.lng] as [number, number])),
  durationMinutes: 50,
  walkMinutes: 20,
  distanceMeters: 1500,
  bbox: plan.bbox,
  routingSource: 'mock',
  fingerprint: '',
  free: true,
  locked: false,
  pinned: false,
  hasPartner: false,
  texts: {},
  createdAt: 1,
  updatedAt: 1,
};

describe('download plan', () => {
  it('allows fixed ready-made and curated routes, but rejects live Explore and Crossroads sessions', () => {
    expect(downloadTourMode(tour)).toBe('tour');
    expect(downloadTourMode({ ...tour, id: 'planned_saved', source: 'planned', template: 'planned' })).toBe(
      'planned',
    );
    for (const mode of ['roam', 'fork', 'explore', 'crossroads']) {
      expect(downloadTourMode({ ...tour, id: `${mode}_session` })).toBeUndefined();
      expect(downloadTourMode({ ...tour, template: mode })).toBeUndefined();
    }
  });

  it('keeps completed curated access beyond online session expiry while respecting finite receipts', () => {
    const planned: Tour = {
      ...tour,
      id: 'planned_saved',
      source: 'planned',
      template: 'planned',
      expiresAt: 10,
    };
    const saved = {
      tourId: planned.id,
      tour: planned,
      access: { tourId: planned.id, mode: 'planned' as const, grantedAt: 1, expiresAt: null },
    };
    expect(offlineAccessValid(saved, 1_000)).toBe(true);
    expect(offlineAccessValid({ ...saved, access: { ...saved.access, expiresAt: 10 } }, 1_000)).toBe(false);
    expect(offlineAccessValid({ ...saved, access: { ...saved.access, tourId: 'different' } }, 1_000)).toBe(
      false,
    );
    expect(offlineAccessValid({ tourId: planned.id, tour: planned }, 1_000)).toBe(false);
    expect(offlineAccessValid({ tourId: tour.id, tour }, 1_000)).toBe(true); // legacy ready-made download
  });

  it('covers every stop with all tiers, all hops and the map tiles (spec 4.8)', () => {
    const items = planDownload(tour);
    const n = tour.stops.length;
    expect(items.filter((i) => i.kind === 'narration')).toHaveLength(n * 3);
    expect(items.filter((i) => i.kind === 'transition')).toHaveLength(n - 1);
    expect(items.filter((i) => i.kind === 'tiles')).toHaveLength(1);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(planDownload(tour, { tiers: ['short'], transitions: false, tiles: false })).toHaveLength(n);
  });

  it('computes weighted progress, clamps values and completes at 1', () => {
    const items = planDownload(tour);
    expect(overallProgress(items, {})).toBe(0);
    const half = Object.fromEntries(items.map((i) => [i.id, 0.5]));
    expect(overallProgress(items, half)).toBeCloseTo(0.5, 5);
    expect(overallProgress(items, Object.fromEntries(items.map((i) => [i.id, 3])))).toBe(1);
    expect(overallProgress([], {})).toBe(1);
  });

  it('estimates a plausible size and formats it', () => {
    const b = estimateDownloadBytes(tour);
    expect(b).toBeGreaterThan(5_000_000);
    expect(b).toBeLessThan(500_000_000);
    expect(estimateDownloadBytes(tour, { tiers: ['short'] })).toBeLessThan(b);
    expect(formatBytes(1_500_000)).toBe('2 MB');
    expect(formatBytes(2_400_000_000)).toBe('2.4 GB');
  });

  it('buffers the map bounds around the tour', () => {
    const b = offlineMapBounds(tour, 400);
    expect(b.south).toBeLessThan(tour.bbox.south);
    expect(b.east).toBeGreaterThan(tour.bbox.east);
  });

  it('finds missing items for resuming and validates manifests', () => {
    const items = planDownload(tour);
    expect(missingItems(items, undefined).some((i) => i.kind === 'tiles')).toBe(false);
    const first = tour.stops[0]!.poiId;
    const m = OfflineManifestSchema.parse({
      version: 1,
      tourId: tour.id,
      lang: 'de',
      tour,
      narrations: {
        [`${first}:short`]: {
          key: 'k',
          title: 'T',
          text: 'x',
          paragraphs: [],
          audioDurationMs: 1000,
          audioFile: 'a.mp3',
          images: [],
        },
      },
      transitions: {},
      bytes: 1,
      createdAt: 1,
      complete: false,
    });
    const missing = missingItems(items, m);
    expect(missing.find((i) => i.id === narrationItemId(first, 'short'))).toBeUndefined();
    expect(missing.length).toBe(items.length - 1 - 1);
    expect(coversTour(m, tour)).toBe(false);
    expect(() => OfflineManifestSchema.parse({ ...m, version: 2 })).toThrow();
  });
});

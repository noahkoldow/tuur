import { z } from 'zod';
import { NarrationLangSchema } from '../narration/types';
import { INTERESTS } from '../constants';
import { LatLngSchema } from '../schemas';
import { ROUTING_PROFILES } from './matrix';

export const TourTextSchema = z.object({
  title: z.string().min(1),
  teaser: z.string().min(1),
  description: z.string().min(1),
  /** Narrative thread (spec 4.3): introduction, hand-overs between stops, closing words. */
  intro: z.string().min(1),
  transitions: z.array(z.object({ fromPoiId: z.string(), toPoiId: z.string(), text: z.string().min(1) })),
  outro: z.string().min(1),
});
export type TourText = z.infer<typeof TourTextSchema>;

/** Model output for a tour concept: texts plus an optional order suggestion which the optimizer re-checks. */
export const TourConceptSchema = TourTextSchema.extend({ suggestedOrder: z.array(z.string()).optional() });
export type TourConcept = z.infer<typeof TourConceptSchema>;

export const TourStopSchema = z.object({
  poiId: z.string(),
  order: z.number().int().nonnegative(),
  name: z.string(),
  location: LatLngSchema,
  dwellMinutes: z.number().positive(),
  walkMinutesFromPrev: z.number().nonnegative(),
  partner: z.boolean().default(false),
});
export type TourStop = z.infer<typeof TourStopSchema>;

export const TourSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  /** Display name of the place (city/municipality) for headings. */
  placeName: z.string().optional(),
  source: z.enum(['auto', 'edited', 'planned']),
  /** Increments on every regeneration; snapshots live in `tourVersions`. */
  version: z.number().int().positive(),
  template: z.string(),
  profile: z.enum(ROUTING_PROFILES),
  themes: z.array(z.enum(INTERESTS)),
  stops: z.array(TourStopSchema).min(1),
  /** Simplified route for the map as encoded polyline (precision 5); decode with `decodePolyline`. */
  path: z.string(),
  durationMinutes: z.number().positive(),
  walkMinutes: z.number().nonnegative(),
  distanceMeters: z.number().nonnegative(),
  bbox: z.object({ south: z.number(), west: z.number(), north: z.number(), east: z.number() }),
  /** Shortest tour per place is free (spec 6.2). */
  /** Where travel times came from; `approx` tours are refreshed when the routing service is back. */
  routingSource: z.enum(['ors', 'approx', 'mock']).default('mock'),
  /** Fingerprint of the stops/scores the tour was built from (detects stale tours). */
  fingerprint: z.string().default(''),
  free: z.boolean().default(false),
  locked: z.boolean().default(false),
  pinned: z.boolean().default(false),
  hasPartner: z.boolean().default(false),
  coverImage: z
    .object({
      url: z.string(),
      author: z.string().optional(),
      license: z.string(),
      licenseUrl: z.string().optional(),
      sourceUrl: z.string(),
    })
    .optional(),
  /** Texts by language; generated on demand per user language. */
  texts: z.record(TourTextSchema).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** Private planned-route session availability online; a saved offline receipt has its own validity. */
  expiresAt: z.number().optional(),
});
export type Tour = z.infer<typeof TourSchema>;

/** Response of the `generateAutoTours` callable. */
export interface GenerateToursResult {
  status: 'ready' | 'generating' | 'area_not_ready' | 'no_tours';
  placeId?: string;
  tours: { id: string; template: string; durationMinutes: number; free: boolean }[];
}

export const ComposeRouteRequestSchema = z.object({
  /** POI ids in the planned order (from the client-side planner). */
  stops: z.array(z.string().min(1).max(120)).min(1).max(25),
  requiredStopIds: z.array(z.string().min(1).max(120)).max(25).optional(),
  /** Optional wider pool: the server re-plans among these with real routing times instead of only dropping stops. */
  candidateIds: z.array(z.string().min(1).max(120)).max(30).optional(),
  /** Used only to route; never stored. Omitted = start at the first stop. */
  start: LatLngSchema.optional(),
  end: LatLngSchema.optional(),
  roundTrip: z.boolean().default(false),
  budgetMinutes: z.number().min(10).max(480),
  profile: z.enum(ROUTING_PROFILES),
  lang: NarrationLangSchema,
  interests: z.array(z.enum(INTERESTS)).max(8).default([]),
});
export type ComposeRouteRequest = z.infer<typeof ComposeRouteRequestSchema>;

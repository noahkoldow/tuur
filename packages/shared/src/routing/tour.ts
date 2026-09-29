import { z } from 'zod';
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
  source: z.enum(['auto', 'edited']),
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
});
export type Tour = z.infer<typeof TourSchema>;

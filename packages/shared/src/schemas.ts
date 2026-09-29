import { z } from 'zod';
import { AREA_STATUSES, INTERESTS } from './constants';

/** Timestamps are epoch milliseconds in all shared schemas; Firestore adapters convert at the edge. */
export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const InterestSchema = z.enum(INTERESTS);

export const ImageRefSchema = z.object({
  /** Wikimedia Commons file title, e.g. "File:Brandenburger Tor.jpg" */
  file: z.string(),
  url: z.string().url(),
  thumbUrl: z.string().url().optional(),
  author: z.string().optional(),
  license: z.string(),
  licenseUrl: z.string().url().optional(),
  sourceUrl: z.string().url(),
});
export type ImageRef = z.infer<typeof ImageRefSchema>;

export const WikipediaRefSchema = z.object({
  lang: z.string(),
  title: z.string(),
  /** Article length in bytes/characters as reported by the API; drives the score. */
  length: z.number().nonnegative().default(0),
  url: z.string().url().optional(),
  extract: z.string().optional(),
});
export type WikipediaRef = z.infer<typeof WikipediaRefSchema>;

export const PoiSourcesSchema = z.object({
  osmId: z.string().optional(),
  wikidataId: z.string().optional(),
  wikipedia: z.array(WikipediaRefSchema).default([]),
  sitelinks: z.number().int().nonnegative().default(0),
});
export type PoiSources = z.infer<typeof PoiSourcesSchema>;

export const PoiSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** Names by language code as available in the sources. */
  names: z.record(z.string()).default({}),
  location: LatLngSchema,
  /** Full precision (9) geohash for radius queries. */
  geohash: z.string(),
  /** Ingest tile geohash (default precision 6). */
  tile: z.string(),
  osmTags: z.record(z.string()).default({}),
  interests: z.array(InterestSchema),
  primaryInterest: InterestSchema.optional(),
  /** Raw source-based score 0-100 (not area-relative). */
  rawScore: z.number().min(0).max(100),
  /** Area-relative score 0-100, before modifiers. */
  baseScore: z.number().min(0).max(100),
  /** Final score including admin weight and capped partner boost. */
  score: z.number().min(0).max(100),
  hidden: z.boolean().default(false),
  adminWeight: z.number().min(0).max(2).default(1),
  /** Extra facts from admins, treated as an additional source (spec 8). */
  adminFacts: z.array(z.string()).default([]),
  partnerId: z.string().optional(),
  accessible: z.boolean().default(true),
  imageRefs: z.array(ImageRefSchema).default([]),
  sources: PoiSourcesSchema,
  /** Visit time estimate in minutes, derived from category/score. */
  dwellMinutes: z.number().positive().default(5),
  updatedAt: z.number(),
});
export type Poi = z.infer<typeof PoiSchema>;

export const AreaSchema = z.object({
  geohash: z.string(),
  status: z.enum(AREA_STATUSES),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** After this the area may be refreshed by the next `ensureArea`. */
  expiresAt: z.number().optional(),
  ingestStartedAt: z.number().optional(),
  ingestAttempts: z.number().int().nonnegative().default(0),
  poiCount: z.number().int().nonnegative().default(0),
  qualityPoiCount: z.number().int().nonnegative().default(0),
  placeId: z.string().optional(),
  locked: z.boolean().default(false),
  error: z.string().optional(),
});
export type Area = z.infer<typeof AreaSchema>;

export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  countryCode: z.string().length(2),
  country: z.string().optional(),
  location: LatLngSchema,
  /** Languages narrations may draw sources from, local language first. */
  sourceLangs: z.array(z.string()).min(1),
  createdAt: z.number(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const EnsureAreaRequestSchema = z.object({
  /** Client computes the tile so the server never sees the exact position (spec 10). */
  geohash: z.string().regex(/^[0-9bcdefghjkmnpqrstuvwxyz]{4,8}$/),
  withNeighbors: z.boolean().default(true),
  /** Optional: warm all cells within this many rings (0-2); overrides `withNeighbors`. */
  rings: z.number().int().min(0).max(2).optional(),
});
export type EnsureAreaRequest = z.infer<typeof EnsureAreaRequestSchema>;

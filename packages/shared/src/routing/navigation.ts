import { z } from 'zod';
import { LatLngSchema } from '../schemas';
import { ROUTING_PROFILES } from './matrix';

/** A single navigation leg; canonical POIs are resolved on the server. */
export const GetWalkingRouteRequestSchema = z
  .object({
    origin: LatLngSchema,
    poiId: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[^/]+$/)
      .optional(),
    destination: LatLngSchema.optional(),
    profile: z.enum(ROUTING_PROFILES).default('foot-walking'),
  })
  .strict()
  .refine((value) => Boolean(value.poiId) !== Boolean(value.destination), {
    message: 'Specify exactly one destination',
  });
export type GetWalkingRouteRequest = z.input<typeof GetWalkingRouteRequestSchema>;

export const WalkingRouteResultSchema = z.object({
  poiId: z.string().optional(),
  /** Actual network-snapped origin, never a synthetic connection to the GPS fix. */
  origin: LatLngSchema,
  /** Requested destination; the final path point is the network-snapped endpoint. */
  destination: LatLngSchema,
  profile: z.enum(ROUTING_PROFILES),
  path: z
    .array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
    .min(2)
    .max(20_000),
  distanceMeters: z.number().finite().nonnegative(),
  durationSeconds: z.number().finite().nonnegative(),
  routingSource: z.enum(['ors', 'mock']),
});
export type WalkingRouteResult = z.infer<typeof WalkingRouteResultSchema>;

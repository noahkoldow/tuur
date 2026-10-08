import { z } from 'zod';
import { INTERESTS, LENGTH_TIERS } from '../constants';
import { LatLngSchema } from '../schemas';
import { TourSchema } from '../routing/tour';
import { ROUTING_PROFILES } from '../routing/matrix';
import { TourScriptSchema } from '../narration/script';

const ids = z.array(z.string().max(200)).max(500);
export const SessionCheckpointSchema = z
  .object({
    version: z.literal(1),
    ownerUid: z.string().min(1).max(200),
    mode: z.enum(['tour', 'planned', 'fork', 'roam']),
    // Checkpoints written before text tours retain their audio behavior.
    contentMode: z.enum(['text', 'audio']).optional(),
    recordId: z.string().min(1).max(200),
    startedAt: z.number().nonnegative(),
    savedAt: z.number().nonnegative(),
    lang: z.string().min(2).max(20),
    voice: z.string().max(40).optional(),
    interests: z.array(z.enum(INTERESTS)).max(8),
    frequency: z.enum(['low', 'normal', 'high']),
    profile: z.enum(ROUTING_PROFILES),
    budgetMinutes: z.number().min(0).max(480),
    simulate: z.boolean(),
    foregroundOnly: z.boolean().optional(),
    tour: TourSchema.optional(),
    script: TourScriptSchema.optional(),
    claimId: z.string().max(200).optional(),
    billingContext: z
      .object({
        mode: z.enum(['tour', 'planned', 'fork', 'roam']),
        tourId: z.string().max(200).optional(),
        placeId: z.string().max(200).optional(),
        tile: z.string().max(30).optional(),
      })
      .optional(),
    groupId: z.string().max(200).optional(),
    guest: z.boolean().optional(),
    position: LatLngSchema.optional(),
    route: z
      .array(
        z.object({
          id: z.string().min(1).max(200),
          name: z.string().max(500),
          location: LatLngSchema,
          navigationOnly: z.boolean().optional(),
        }),
      )
      .max(500),
    progress: z.object({
      index: z.number().int().nonnegative(),
      visited: ids,
      skipped: ids,
      narrated: ids,
      playedTier: z.record(z.enum(LENGTH_TIERS)),
      reached: z.record(z.literal(true)).optional(),
      closest: z.record(z.number().finite().nonnegative()).optional(),
      playback: z
        .object({
          poiId: z.string().max(200),
          tier: z.enum(LENGTH_TIERS),
          positionMs: z.number().min(0).max(1_200_000),
        })
        .optional(),
    }),
  })
  .superRefine((s, ctx) => {
    if ((s.mode === 'tour' || s.mode === 'planned') && !s.tour)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A fixed itinerary requires its tour' });
    if (s.progress.index > s.route.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Progress is outside the route' });
  });

export type SessionCheckpoint = z.infer<typeof SessionCheckpointSchema>;

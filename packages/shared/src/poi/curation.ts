import { z } from 'zod';
import { InterestSchema } from '../schemas';
import { NarrationLangSchema } from '../narration/types';

const PoiIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Clients propose known nearby IDs; the server supplies every place fact used for curation. */
export const SelectNearbyRequestSchema = z.object({
  candidateIds: z.array(PoiIdSchema).min(1).max(12),
  lang: NarrationLangSchema,
  interests: z.array(InterestSchema).max(20),
  thread: z.string().max(600).optional(),
  previousPoiName: z.string().max(120).optional(),
  access: z
    .object({
      tourId: z.string().max(200).optional(),
      mode: z.enum(['tour', 'planned', 'fork', 'roam']).optional(),
      groupId: z.string().max(60).optional(),
    })
    .optional(),
});
export type SelectNearbyRequest = z.infer<typeof SelectNearbyRequestSchema>;

export const SelectNearbyResultSchema = z.object({
  poiIds: z.array(PoiIdSchema).max(12),
  source: z.enum(['gemini', 'fallback']),
});
export type SelectNearbyResult = z.infer<typeof SelectNearbyResultSchema>;

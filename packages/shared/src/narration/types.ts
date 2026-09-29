import { z } from 'zod';
import { INTERESTS, LENGTH_TIERS } from '../constants';

export const GetNarrationRequestSchema = z.object({
  poiId: z.string().min(1).max(120),
  lang: z.string().regex(/^[a-z]{2,3}$/),
  lengthTier: z.enum(LENGTH_TIERS),
  primaryInterest: z.enum(INTERESTS).optional(),
  /** Optional narrative context, e.g. previous stop title for smooth hand-over. */
  context: z
    .object({
      previousPoiName: z.string().max(200).optional(),
      tourTitle: z.string().max(200).optional(),
    })
    .optional(),
});
export type GetNarrationRequest = z.infer<typeof GetNarrationRequestSchema>;

/** Structured model output (spec 4.4.3). */
export const NarrationOutputSchema = z.object({
  title: z.string().min(1),
  narration: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1),
  keyFacts: z.array(z.string()),
  sourcesUsed: z.array(z.string()),
});
export type NarrationOutput = z.infer<typeof NarrationOutputSchema>;

export const ParagraphSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
});
export type Paragraph = z.infer<typeof ParagraphSchema>;

export const NARRATION_STATUSES = ['ok', 'blocked', 'pending_review'] as const;

export const NarrationDocSchema = z.object({
  key: z.string(),
  poiId: z.string(),
  lang: z.string(),
  lengthTier: z.enum(LENGTH_TIERS),
  primaryInterest: z.string(),
  promptVersion: z.string(),
  title: z.string(),
  text: z.string(),
  paragraphs: z.array(ParagraphSchema),
  keyFacts: z.array(z.string()),
  sourcesUsed: z.array(z.string()),
  audioPath: z.string(),
  audioMimeType: z.string(),
  audioDurationMs: z.number().nonnegative(),
  /** Set only for grounded output; grounded narrations are not shared/cached (see D16). */
  grounded: z.boolean().default(false),
  groundedExpiresAt: z.number().optional(),
  status: z.enum(NARRATION_STATUSES).default('ok'),
  /** Flag for the compliance notice "AI generated"; always true for generated text. */
  aiGenerated: z.literal(true).default(true),
  models: z.object({ text: z.string(), tts: z.string() }),
  createdAt: z.number(),
});
export type NarrationDoc = z.infer<typeof NarrationDocSchema>;

export interface NarrationResponse {
  key: string;
  title: string;
  text: string;
  paragraphs: Paragraph[];
  keyFacts: string[];
  /** Cloud Storage path; the client resolves a download URL with the Storage SDK (rules: signed-in read). */
  audioPath: string;
  audioDurationMs: number;
  images: {
    url: string;
    thumbUrl?: string;
    author?: string;
    license: string;
    licenseUrl?: string;
    sourceUrl: string;
  }[];
  cached: boolean;
  aiGenerated: true;
  /** Present for grounded output: Google requires the search entry point to be shown next to the content. */
  grounding?: { queries: number; searchEntryPointHtml?: string; sources: { uri: string; title?: string }[] };
}

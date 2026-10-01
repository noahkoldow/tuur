import { z } from 'zod';
import { INTERESTS, LENGTH_TIERS } from '../constants';
import { NARRATION_LANGS } from './prompt';

/** Supported narration languages as a plain string (keeps client code simple; unknown codes are rejected). */
export const NarrationLangSchema = z
  .string()
  .refine((l) => (NARRATION_LANGS as readonly string[]).includes(l), 'Unsupported language');

export const GetNarrationRequestSchema = z.object({
  poiId: z.string().min(1).max(120),
  lang: NarrationLangSchema,
  lengthTier: z.enum(LENGTH_TIERS),
  primaryInterest: z.enum(INTERESTS).optional(),
  /** Guide voice persona id chosen in the settings (unknown ids fall back to the default voice). */
  voice: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,30}$/)
    .optional(),
  /** What the listener is doing; the server checks entitlements against it (never trusts free/bought claims). */
  access: z
    .object({
      tourId: z.string().max(200).optional(),
      mode: z.enum(['tour', 'planned', 'fork', 'roam']).optional(),
      /** Live group the listener joined (D47); the server checks membership, never trusts the claim. */
      groupId: z.string().max(60).optional(),
    })
    .optional(),
  /** Set by the offline download manager: uses the download rate-limit bucket. */
  download: z.boolean().optional(),
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
  /** Voice persona of the stored audio (other voices live in the `voices` subcollection). Missing = default. */
  voiceId: z.string().optional(),
  /** Set only for grounded output; grounded narrations are not shared/cached (see D16). */
  grounded: z.boolean().default(false),
  groundedExpiresAt: z.number().optional(),
  /** Partner introduction (announced as such in the audio and labeled in the app, spec 7.3). */
  sponsored: z.boolean().default(false),
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
  /** Short-lived signed URL, issued only after the access check (Storage rules deny direct reads). */
  audioUrl?: string;
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
  /** True for partner introductions; the app shows the partner label next to it. */
  sponsored?: boolean;
  /** Present for grounded output: Google requires the search entry point to be shown next to the content. */
  grounding?: { queries: number; searchEntryPointHtml?: string; sources: { uri: string; title?: string }[] };
}

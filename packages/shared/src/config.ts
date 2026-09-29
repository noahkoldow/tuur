import { z } from 'zod';

/**
 * Runtime AI configuration, stored in Firestore `config/ai`. Model names are never hard-coded at call
 * sites; these defaults are only a fallback and MUST be re-verified against the official Gemini model
 * and deprecation docs when the pipeline is implemented (Phase 2, see docs/DECISIONS.md).
 */
export const AiConfigSchema = z.object({
  models: z.object({
    narration: z.string().min(1),
    lite: z.string().min(1),
    tts: z.string().min(1),
  }),
  /** Guide voice per language (TTS voice name); `default` is the fallback. */
  voices: z.record(z.string()),
  promptVersion: z.string().min(1),
  /** Google Search grounding (default off, see DECISIONS D16: grounded output is never cached). */
  groundingEnabled: z.boolean(),
  /** Global daily spend cap in USD; exceeding it blocks new generation (cached content still served). */
  dailyBudgetUsd: z.number().nonnegative(),
  /** Per-area (tile) daily cap in USD. */
  areaDailyBudgetUsd: z.number().nonnegative(),
  killSwitch: z.boolean(),
  /** Prices used only for cost logging/budget estimates; keep in sync with Google's price list. */
  pricing: z.object({
    inputPerMTokUsd: z.number().nonnegative(),
    outputPerMTokUsd: z.number().nonnegative(),
    liteInputPerMTokUsd: z.number().nonnegative(),
    liteOutputPerMTokUsd: z.number().nonnegative(),
    ttsPerMCharsUsd: z.number().nonnegative(),
    groundingPer1kQueriesUsd: z.number().nonnegative(),
    routingPer1kCallsUsd: z.number().nonnegative().default(0),
  }),
  rateLimits: z.object({
    perUserPerHour: z.number().int().positive(),
    perAreaPerHour: z.number().int().positive(),
  }),
});
export type AiConfig = z.infer<typeof AiConfigSchema>;

/**
 * Defaults verified 2026-09-29 against search snippets of ai.google.dev (primary docs were not reachable
 * from the build sandbox): gemini-3.8-flash (text), gemini-3.5-flash-lite (lite), gemini-3.8-flash-lite-tts.
 * Admins override via Firestore `config/ai`. Re-verify before launch, see docs/DECISIONS.md D16.
 */
export const DEFAULT_AI_CONFIG: AiConfig = {
  models: { narration: 'gemini-3.8-flash', lite: 'gemini-3.5-flash-lite', tts: 'gemini-3.8-flash-lite-tts' },
  voices: { default: 'Kore', de: 'Kore', en: 'Kore' },
  promptVersion: 'v1',
  groundingEnabled: false,
  dailyBudgetUsd: 20,
  areaDailyBudgetUsd: 3,
  killSwitch: false,
  pricing: {
    inputPerMTokUsd: 0.5,
    outputPerMTokUsd: 3,
    liteInputPerMTokUsd: 0.1,
    liteOutputPerMTokUsd: 0.4,
    ttsPerMCharsUsd: 10,
    groundingPer1kQueriesUsd: 35,
    routingPer1kCallsUsd: 0.5,
  },
  rateLimits: { perUserPerHour: 60, perAreaPerHour: 600 },
};

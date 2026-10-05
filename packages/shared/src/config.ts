import { z } from 'zod';
import { DEFAULT_VOICE_CAST, DEFAULT_VOICE_ID, VoicePersonaSchema } from './narration/voices';

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
  /** Legacy Gemini voice per language; only used when no voice cast entry applies. */
  voices: z.record(z.string()),
  /** Selectable guide voices (`provider:name` + style); listeners pick one in the settings. */
  voiceCast: z.array(VoicePersonaSchema).min(1).default(DEFAULT_VOICE_CAST),
  defaultVoiceId: z.string().default(DEFAULT_VOICE_ID),
  /** TTS model per provider (Gemini falls back to `models.tts`); never hard-coded at call sites. */
  ttsModels: z.record(z.string().min(1)).default({ openai: 'gpt-4o-mini-tts' }),
  promptVersion: z.string().min(1),
  /** Google Search grounding (default off, see DECISIONS D16: grounded output is never cached). */
  groundingEnabled: z.boolean(),
  /** Global admission limit on estimated AI spend in USD, including pending reservations. Not an invoice cap. */
  dailyBudgetUsd: z.number().nonnegative().max(3),
  /** Per-area (tile) daily cap in USD. */
  areaDailyBudgetUsd: z.number().nonnegative(),
  killSwitch: z.boolean(),
  /** Estimated provider prices, not an invoice guarantee; keep in sync with each provider's billing. */
  pricing: z.object({
    inputPerMTokUsd: z.number().nonnegative(),
    outputPerMTokUsd: z.number().nonnegative(),
    liteInputPerMTokUsd: z.number().nonnegative(),
    liteOutputPerMTokUsd: z.number().nonnegative(),
    ttsPerMCharsUsd: z.number().nonnegative(),
    /** Per-provider TTS price override (USD per million characters). */
    ttsPerMCharsUsdByProvider: z.record(z.number().nonnegative()).default({ openai: 17 }),
    groundingPer1kQueriesUsd: z.number().nonnegative(),
    routingPer1kCallsUsd: z.number().nonnegative().default(0),
  }),
  rateLimits: z.object({
    perUserPerHour: z.number().int().positive(),
    perAreaPerHour: z.number().int().positive(),
    /** Separate, higher bucket for offline downloads which generate all tiers of a tour at once. */
    downloadPerUserPerHour: z.number().int().positive().default(300),
  }),
});
export type AiConfig = z.infer<typeof AiConfigSchema>;

/**
 * Defaults verified 2026-10-03 against ai.google.dev/gemini-api/docs/models and speech-generation:
 * Gemini 3.8 Flash (text + high-fidelity TTS), Gemini 3.5 Flash-Lite (classification/fact checking).
 * Admins override via Firestore `config/ai`. Re-verify before launch, see docs/DECISIONS.md D16.
 */
export const DEFAULT_AI_CONFIG: AiConfig = {
  models: { narration: 'gemini-3.8-flash', lite: 'gemini-3.5-flash-lite', tts: 'gemini-3.8-flash-tts' },
  voices: { default: 'Kore', de: 'Kore', en: 'Kore' },
  voiceCast: DEFAULT_VOICE_CAST,
  defaultVoiceId: DEFAULT_VOICE_ID,
  ttsModels: { openai: 'gpt-4o-mini-tts' },
  promptVersion: 'v2',
  groundingEnabled: false,
  dailyBudgetUsd: 3,
  areaDailyBudgetUsd: 3,
  killSwitch: false,
  pricing: {
    // ai.google.dev/gemini-api/docs/pricing, checked 2026-09-30: Flash 0.75/3.75 and Flash TTS double on 2027-01-01
    inputPerMTokUsd: 0.75,
    outputPerMTokUsd: 3.75,
    liteInputPerMTokUsd: 0.3,
    liteOutputPerMTokUsd: 2.5,
    // Conservative character estimate for slow narration; Gemini bills audio tokens, not characters.
    ttsPerMCharsUsd: 50,
    ttsPerMCharsUsdByProvider: { openai: 17 },
    groundingPer1kQueriesUsd: 35,
    routingPer1kCallsUsd: 0.5,
  },
  rateLimits: { perUserPerHour: 60, perAreaPerHour: 600, downloadPerUserPerHour: 300 },
};

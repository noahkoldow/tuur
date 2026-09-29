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
  promptVersion: z.string().min(1),
  groundingEnabled: z.boolean(),
  dailyBudgetUsd: z.number().nonnegative(),
  killSwitch: z.boolean(),
});
export type AiConfig = z.infer<typeof AiConfigSchema>;

export const DEFAULT_AI_CONFIG: AiConfig = {
  models: {
    narration: 'gemini-flash-latest',
    lite: 'gemini-flash-lite-latest',
    tts: 'gemini-tts-placeholder',
  },
  promptVersion: 'v1',
  groundingEnabled: false,
  dailyBudgetUsd: 20,
  killSwitch: false,
};

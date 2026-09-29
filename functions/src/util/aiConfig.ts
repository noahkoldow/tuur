import type { Firestore } from 'firebase-admin/firestore';
import { AiConfigSchema, DEFAULT_AI_CONFIG, type AiConfig } from '@tuur/shared';

let cache: { at: number; cfg: AiConfig } | undefined;

/**
 * Reads `config/ai` (admin-editable) merged over the shared defaults; invalid documents fall back to the
 * defaults instead of breaking generation. Cached for 60 s per instance.
 */
export async function loadAiConfig(db: Firestore, now = Date.now()): Promise<AiConfig> {
  if (cache && now - cache.at < 60_000) return cache.cfg;
  let cfg = DEFAULT_AI_CONFIG;
  try {
    const snap = await db.collection('config').doc('ai').get();
    if (snap.exists) {
      const d = snap.data() as Partial<AiConfig>;
      const merged = {
        ...DEFAULT_AI_CONFIG,
        ...d,
        models: { ...DEFAULT_AI_CONFIG.models, ...d.models },
        voices: { ...DEFAULT_AI_CONFIG.voices, ...d.voices },
        pricing: { ...DEFAULT_AI_CONFIG.pricing, ...d.pricing },
        rateLimits: { ...DEFAULT_AI_CONFIG.rateLimits, ...d.rateLimits },
      };
      const parsed = AiConfigSchema.safeParse(merged);
      if (parsed.success) cfg = parsed.data;
    }
  } catch {
    // keep defaults
  }
  cache = { at: now, cfg };
  return cfg;
}

export function resetAiConfigCache(): void {
  cache = undefined;
}

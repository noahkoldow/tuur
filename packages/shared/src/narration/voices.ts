import { z } from 'zod';

/** TTS back ends behind the TtsProvider interface; a voice is addressed as `provider:name`. */
export const TTS_PROVIDERS = ['gemini', 'openai'] as const;
export type TtsProviderId = (typeof TTS_PROVIDERS)[number];

const VoiceSpecSchema = z.string().regex(/^(gemini|openai):[A-Za-z0-9_-]{2,40}$/);

/**
 * A tuur guide voice ("persona"): the provider voice plus a spoken-style direction, and a fallback voice on the
 * other provider so narration keeps working when one provider is not configured.
 */
export const VoicePersonaSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/),
  voice: VoiceSpecSchema,
  fallback: VoiceSpecSchema.optional(),
  /** Delivery direction (OpenAI `instructions`, Gemini natural-language style prompt). */
  style: z.string().min(1).max(600),
  names: z.record(z.string().min(1)),
  blurb: z.record(z.string().min(1)),
});
export type VoicePersona = z.infer<typeof VoicePersonaSchema>;

const GUIDE =
  'You are a local city guide talking to one person walking next to you. Sound like a real human in a relaxed conversation, not like an announcer or an audiobook: natural rhythm, small pauses where a person would breathe or think, a light smile in the voice, stress on the surprising detail. Keep the language of the text and say local names the way locals do.';

/**
 * Default cast (owner request 2026-09-30: human-sounding voices like the ChatGPT voice call). OpenAI `marin` and
 * `cedar` are the voices OpenAI recommends for best quality; Gemini voices are the fallback and a third character.
 */
export const DEFAULT_VOICE_CAST: VoicePersona[] = [
  {
    id: 'mara',
    voice: 'openai:marin',
    fallback: 'gemini:Sulafat',
    style: `${GUIDE} Personality: warm, curious and lively, like a friend who knows every corner of the city.`,
    names: { de: 'Mara', en: 'Mara' },
    blurb: { de: 'Warm und lebendig', en: 'Warm and lively' },
  },
  {
    id: 'jonas',
    voice: 'openai:cedar',
    fallback: 'gemini:Sadaltager',
    style: `${GUIDE} Personality: calm, grounded storyteller with a low, relaxed voice who lets moments land.`,
    names: { de: 'Jonas', en: 'Jonas' },
    blurb: { de: 'Ruhig und erzählend', en: 'Calm storyteller' },
  },
  {
    id: 'lina',
    voice: 'gemini:Achird',
    fallback: 'openai:coral',
    style: `${GUIDE} Personality: friendly, upbeat and a little playful, enjoys the odd anecdote.`,
    names: { de: 'Linus', en: 'Linus' },
    blurb: { de: 'Freundlich und verspielt', en: 'Friendly and playful' },
  },
];
export const DEFAULT_VOICE_ID = 'mara';

/** Display the renamed persona consistently, including older remote casts; persisted voice IDs stay stable. */
export function voiceDisplayName(persona: Pick<VoicePersona, 'id' | 'names'>, lang: string): string {
  if (persona.id === 'lina') return 'Linus';
  const baseLanguage = lang.toLowerCase().split(/[-_]/)[0]!;
  return persona.names[lang] ?? persona.names[baseLanguage] ?? persona.names['en'] ?? persona.id;
}

export function parseVoiceSpec(spec: string): { provider: TtsProviderId; name: string } {
  const [provider, name] = spec.split(':') as [TtsProviderId, string];
  return { provider, name };
}

/** The requested persona, else the configured default, else the first of the cast. */
export function resolvePersona(cast: VoicePersona[], defaultId: string, id?: string): VoicePersona {
  return cast.find((v) => v.id === id) ?? cast.find((v) => v.id === defaultId) ?? cast[0]!;
}

/** Voice to use given the providers that are configured: the primary one, else the fallback, else none. */
export function pickVoiceSpec(
  persona: VoicePersona,
  available: (p: TtsProviderId) => boolean,
): string | undefined {
  for (const spec of [persona.voice, persona.fallback]) {
    if (spec && available(parseVoiceSpec(spec).provider)) return spec;
  }
  return undefined;
}

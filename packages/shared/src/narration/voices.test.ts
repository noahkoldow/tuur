import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG } from '../config';
import { estimateCostUsd } from './cost';
import {
  DEFAULT_VOICE_CAST,
  DEFAULT_VOICE_ID,
  VoicePersonaSchema,
  parseVoiceSpec,
  pickVoiceSpec,
  resolvePersona,
  voiceDisplayName,
} from './voices';

describe('voice cast', () => {
  it('displays Linus while preserving the lina ID and normalizes older remote display names', () => {
    const linus = resolvePersona(DEFAULT_VOICE_CAST, DEFAULT_VOICE_ID, 'lina');
    expect(linus.id).toBe('lina');
    expect(linus.names).toEqual({ de: 'Linus', en: 'Linus' });
    const legacy = { ...linus, names: { de: 'Lina', en: 'Lina' } };
    expect(voiceDisplayName(legacy, 'de-DE')).toBe('Linus');
    expect(voiceDisplayName(legacy, 'en')).toBe('Linus');
    expect(legacy.names.de).toBe('Lina');
    expect(voiceDisplayName({ id: 'other', names: { de: 'Anders', en: 'Other' } }, 'de-DE')).toBe('Anders');
    expect(voiceDisplayName({ id: 'other', names: { en: 'Other' } }, 'fr')).toBe('Other');
  });

  it('ships valid personas with a fallback on the other provider', () => {
    for (const v of DEFAULT_VOICE_CAST) {
      expect(VoicePersonaSchema.safeParse(v).success).toBe(true);
      expect(parseVoiceSpec(v.fallback!).provider).not.toBe(parseVoiceSpec(v.voice).provider);
      expect(v.names['de'] && v.names['en'] && v.blurb['de'] && v.blurb['en']).toBeTruthy();
    }
    expect(DEFAULT_VOICE_CAST.some((v) => v.id === DEFAULT_VOICE_ID)).toBe(true);
  });

  it('resolves unknown ids to the default persona', () => {
    expect(resolvePersona(DEFAULT_VOICE_CAST, 'jonas', 'nope').id).toBe('jonas');
    expect(resolvePersona(DEFAULT_VOICE_CAST, 'nope').id).toBe(DEFAULT_VOICE_CAST[0]!.id);
    expect(resolvePersona(DEFAULT_VOICE_CAST, DEFAULT_VOICE_ID, 'lina').id).toBe('lina');
  });

  it('falls back to the other provider when the primary one is not configured', () => {
    const mara = resolvePersona(DEFAULT_VOICE_CAST, 'mara');
    expect(pickVoiceSpec(mara, () => true)).toBe('openai:marin');
    expect(pickVoiceSpec(mara, (p) => p === 'gemini')).toBe('gemini:Sulafat');
    expect(pickVoiceSpec(mara, () => false)).toBeUndefined();
  });

  it('prices TTS per provider for the budget', () => {
    const p = DEFAULT_AI_CONFIG.pricing;
    expect(estimateCostUsd({ ttsChars: 1e6 }, p)).toBe(p.ttsPerMCharsUsd);
    expect(estimateCostUsd({ ttsChars: 1e6, ttsProvider: 'openai' }, p)).toBe(
      p.ttsPerMCharsUsdByProvider['openai'],
    );
  });
});

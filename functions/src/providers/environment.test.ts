import { describe, expect, it } from 'vitest';
import { validateProvider } from './environment';

describe('live provider configuration', () => {
  it.each([
    ['TUUR_LLM_PROVIDER', 'gemini'],
    ['TUUR_TTS_PROVIDER', 'live'],
    ['TUUR_POI_PROVIDER', 'live'],
    ['TUUR_GEOCODING_PROVIDER', 'nominatim'],
    ['TUUR_ROUTING_PROVIDER', 'openrouteservice'],
    ['TUUR_PAYMENTS_PROVIDER', 'stripe'],
  ])('fails closed for missing/mock/misspelled %s in every deployed environment', (name, live) => {
    for (const environment of ['production', 'beta', 'development']) {
      for (const selected of ['', 'mock', 'typo'])
        expect(() => validateProvider(name, selected, [live], { TUUR_DEPLOYMENT_ENV: environment })).toThrow(
          name,
        );
      expect(validateProvider(name, live, [live], { TUUR_DEPLOYMENT_ENV: environment })).toBe(live);
    }
    expect(validateProvider(name, 'mock', [live], { FUNCTIONS_EMULATOR: 'true' })).toBe('mock');
    expect(() => validateProvider(name, 'typo', [live], { FUNCTIONS_EMULATOR: 'true' })).toThrow(name);
  });
});

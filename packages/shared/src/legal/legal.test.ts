import { describe, expect, it } from 'vitest';
import { LEGAL_DOCS, MISSING, getLegalDocument, hasMissing } from '..';

const full = {
  name: 'tuur GmbH',
  address: 'Musterstr. 1, 10115 Berlin',
  email: 'hello@tuur.example',
  privacyEmail: 'privacy@tuur.example',
  representative: 'Erika Mustermann',
};

describe('legal documents', () => {
  it('exist for every document in both languages with the same structure', () => {
    for (const id of LEGAL_DOCS) {
      const de = getLegalDocument(id, 'de', full);
      const en = getLegalDocument(id, 'en', full);
      expect(de.sections.length).toBeGreaterThan(1);
      expect(en.sections.length).toBe(de.sections.length);
      expect(de.version).toBe(en.version);
    }
  });

  it('show a marker for every missing operator value so a release check can catch it', () => {
    for (const id of LEGAL_DOCS) {
      expect(hasMissing(getLegalDocument(id, 'de', {}))).toBe(true);
      expect(hasMissing(getLegalDocument(id, 'de', full))).toBe(false);
      expect(hasMissing(getLegalDocument(id, 'en', full))).toBe(false);
    }
    expect(JSON.stringify(getLegalDocument('imprint', 'de', {}))).toContain(MISSING);
  });

  it('privacy policy covers every processor and right the product relies on', () => {
    const text = JSON.stringify(getLegalDocument('privacy', 'de', full));
    for (const word of [
      'Firebase',
      'Gemini',
      'RevenueCat',
      'MapTiler',
      'OpenRouteService',
      'AdMob',
      'Stripe',
      'Crashlytics',
      'Kartenraster',
      'Aufsichtsbehörde',
      'widerrufen',
    ])
      expect(text).toContain(word);
  });

  it('terms name the statutory withdrawal rule for digital content and subscription renewal', () => {
    const t = JSON.stringify(getLegalDocument('terms', 'de', full));
    expect(t).toContain('§ 356 Abs. 5 BGB');
    expect(t).toContain('24 Stunden vor Ablauf');
  });
});

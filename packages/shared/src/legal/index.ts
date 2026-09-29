import { imprintDe, imprintEn } from './imprint';
import { partnerTermsDe, partnerTermsEn } from './partnerTerms';
import { privacyDe, privacyEn } from './privacy';
import { termsDe, termsEn } from './terms';
import type { LegalDocId, LegalDocument, OperatorInfo } from './types';

export * from './types';

const BUILDERS: Record<LegalDocId, Record<'de' | 'en', (o: OperatorInfo) => LegalDocument>> = {
  privacy: { de: privacyDe, en: privacyEn },
  terms: { de: termsDe, en: termsEn },
  imprint: { de: imprintDe, en: imprintEn },
  'partner-terms': { de: partnerTermsDe, en: partnerTermsEn },
};

/** Legal texts are shared by app and web so both always show the same wording. */
export function getLegalDocument(id: LegalDocId, lang: string, operator: OperatorInfo): LegalDocument {
  return BUILDERS[id][lang === 'de' ? 'de' : 'en'](operator);
}

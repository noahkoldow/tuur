import { LEGAL_VERSION, MISSING, type LegalDocument, type OperatorInfo } from './types';

const v = (s: string | undefined) => (s && s.trim() ? s.trim() : MISSING);
const opt = (label: string, s: string | undefined) => (s && s.trim() ? [`${label}: ${s.trim()}`] : []);

/** Provider identification (§ 5 DDG). Optional lines only appear when the operator supplied them. */
export function imprintDe(o: OperatorInfo): LegalDocument {
  return {
    id: 'imprint',
    title: 'Impressum',
    version: LEGAL_VERSION,
    sections: [
      {
        heading: 'Angaben gemäß § 5 DDG',
        paragraphs: [
          v(o.name),
          v(o.address),
          ...opt('Vertreten durch', o.representative),
          ...opt('Handelsregister', o.register),
          ...opt('Umsatzsteuer-ID', o.vatId),
        ],
      },
      {
        heading: 'Kontakt',
        paragraphs: [`E-Mail: ${v(o.email)}`, ...opt('Telefon', o.phone)],
      },
      {
        heading: 'Verantwortlich für Inhalte',
        paragraphs: [
          `${v(o.representative ?? o.name)}, Anschrift wie oben.`,
          'Die Erzählungen in der App werden automatisch von KI aus öffentlichen Quellen erzeugt und sind entsprechend gekennzeichnet. Bildnachweise (Urheber, Lizenz) werden am jeweiligen Bild angezeigt. Kartendaten: © OpenStreetMap-Mitwirkende.',
        ],
      },
    ],
  };
}

export function imprintEn(o: OperatorInfo): LegalDocument {
  return {
    id: 'imprint',
    title: 'Imprint',
    version: LEGAL_VERSION,
    sections: [
      {
        heading: 'Provider information (Sec. 5 DDG)',
        paragraphs: [
          v(o.name),
          v(o.address),
          ...opt('Represented by', o.representative),
          ...opt('Commercial register', o.register),
          ...opt('VAT ID', o.vatId),
        ],
      },
      { heading: 'Contact', paragraphs: [`Email: ${v(o.email)}`, ...opt('Phone', o.phone)] },
      {
        heading: 'Responsible for content',
        paragraphs: [
          `${v(o.representative ?? o.name)}, address as above.`,
          'Narrations in the app are generated automatically by AI from public sources and are labeled accordingly. Image credits (author, license) are shown at each image. Map data: © OpenStreetMap contributors.',
        ],
      },
    ],
  };
}

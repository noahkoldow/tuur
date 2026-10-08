export type LegalDocId = 'privacy' | 'terms' | 'imprint' | 'partner-terms';
export const LEGAL_DOCS: LegalDocId[] = ['privacy', 'terms', 'imprint', 'partner-terms'];

/** Operator (controller) details; supplied per environment, never hard-coded (spec 10). */
export interface OperatorInfo {
  name?: string | undefined;
  address?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  register?: string | undefined;
  vatId?: string | undefined;
  representative?: string | undefined;
  privacyEmail?: string | undefined;
  authority?: string | undefined;
  webBaseUrl?: string | undefined;
}

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  id: LegalDocId;
  title: string;
  /** Effective date (ISO); bump when the text changes. */
  version: string;
  sections: LegalSection[];
}

export const LEGAL_VERSION = '2026-10-08';

/** Marker used where the operator has not supplied a value yet; release checks fail while any marker is present. */
export const MISSING = '⟦operator data missing⟧';
export const hasMissing = (doc: LegalDocument) =>
  doc.sections.some((s) => s.paragraphs.some((p) => p.includes(MISSING)));

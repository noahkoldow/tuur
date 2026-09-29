import { LEGAL_VERSION, MISSING, type LegalDocument, type OperatorInfo } from './types';

const v = (s: string | undefined) => (s && s.trim() ? s.trim() : MISSING);

export function partnerTermsDe(o: OperatorInfo): LegalDocument {
  return {
    id: 'partner-terms',
    title: 'Nutzungsbedingungen für Partner',
    version: LEGAL_VERSION,
    sections: [
      {
        heading: '1. Geltungsbereich',
        paragraphs: [
          `Diese Bedingungen gelten zwischen ${v(o.name)}, ${v(o.address)} (Anbieter) und Unternehmern, die das tuur-Partnerprogramm nutzen (Partner). Das Angebot richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB.`,
        ],
      },
      {
        heading: '2. Leistungen',
        paragraphs: [
          'Paket „Sichtbarkeit“: Der verknüpfte Ort erhält einen zeitlich befristeten, begrenzten Sichtbarkeitsbonus bei der Auswahl von Orten für Touren, Routen und Weggabelungen und wird als „Partner“ gekennzeichnet. Ein Anspruch auf Aufnahme in bestimmte Touren oder auf eine Mindestzahl an Einblendungen besteht nicht; der Bonus ist gedeckelt, damit Routen sinnvoll bleiben.',
          'Paket „Sichtbarkeit + Angebote“: zusätzlich Angebote für tuur-Nutzer, die per QR-Code vor Ort eingelöst werden. Der Partner löst Codes mit dem Scanner im Partnerportal ein. Jeder Code gilt einmal und 10 Minuten.',
          'Partnerstatistiken sind aggregiert und anonym (Einblendungen, Besuche, Einlösungen).',
        ],
      },
      {
        heading: '3. Freigabe und Inhalte',
        paragraphs: [
          'Profil und Ortsverknüpfung werden vor der Freigabe geprüft. Änderungen an Name, Beschreibung, Kategorie oder Ort setzen das Profil bis zur erneuten Prüfung zurück. Der Partner sichert zu, dass seine Angaben zutreffend und rechtmäßig sind und keine Rechte Dritter verletzen, und stellt den Anbieter von entsprechenden Ansprüchen frei. Angaben werden als „Partnervorstellung“ gekennzeichnet vorgelesen und nicht als geprüfte Tatsachen dargestellt; Superlative, Preisangaben und Versprechen werden nicht übernommen.',
          'Der Partner ist für seine Angebote (Inhalt, Preise, Einlösung, gesetzliche Pflichten, z. B. Preisangaben) selbst verantwortlich.',
        ],
      },
      {
        heading: '4. Preise, Zahlung, Laufzeit',
        paragraphs: [
          'Die Pakete sind Abonnements. Preis, Währung, Steuern und Laufzeit werden vor Vertragsschluss im Zahlungsdialog von Stripe angezeigt. Das Abonnement verlängert sich automatisch, wenn es nicht zum Ende der Laufzeit über das Kundenportal gekündigt wird. Bei Zahlungsausfall oder Kündigung endet der Bonus mit Ablauf der bezahlten Laufzeit; Angebote werden dann nicht mehr angezeigt.',
        ],
      },
      {
        heading: '5. Sperrung',
        paragraphs: [
          'Wir dürfen Partner sperren, wenn Inhalte rechtswidrig, irreführend oder unzutreffend sind, bei Missbrauch (z. B. Manipulation von Einlösungen) oder aus wichtigem Grund. Bereits gezahlte Entgelte für den Zeitraum einer berechtigten Sperrung werden nicht erstattet.',
        ],
      },
      {
        heading: '6. Datenschutz',
        paragraphs: [
          'Für Kontodaten des Partners gilt die Datenschutzerklärung. Bei der Einlösung erhalten Partner keine personenbezogenen Daten der Nutzer.',
        ],
      },
      {
        heading: '7. Haftung, Recht',
        paragraphs: [
          'Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit; bei einfacher Fahrlässigkeit nur für die Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, vertragstypischen Schaden. Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts.',
          `Kontakt: ${v(o.email)}. Stand: ${LEGAL_VERSION}.`,
        ],
      },
    ],
  };
}

export function partnerTermsEn(o: OperatorInfo): LegalDocument {
  return {
    id: 'partner-terms',
    title: 'Partner terms',
    version: LEGAL_VERSION,
    sections: [
      {
        heading: '1. Scope',
        paragraphs: [
          `These terms apply between ${v(o.name)}, ${v(o.address)} (provider) and businesses using the tuur partner program (partners). The offer is directed exclusively at businesses within the meaning of Sec. 14 German Civil Code.`,
        ],
      },
      {
        heading: '2. Services',
        paragraphs: [
          'Plan "Visibility": the linked place receives a time-limited, capped visibility bonus when places are selected for tours, routes and crossroads and is labeled "Partner". There is no entitlement to inclusion in specific tours or to a minimum number of impressions; the bonus is capped so that routes stay sensible.',
          'Plan "Visibility + offers": additionally offers for tuur users that are redeemed on site with a QR code. The partner redeems codes with the scanner in the partner portal. Each code works once and for 10 minutes.',
          'Partner statistics are aggregated and anonymous (impressions, visits, redemptions).',
        ],
      },
      {
        heading: '3. Approval and content',
        paragraphs: [
          'Profile and place link are reviewed before approval. Changes to name, description, category or place send the profile back to review. The partner warrants that its information is accurate, lawful and does not infringe third-party rights and indemnifies the provider against related claims. Information is read aloud labeled as a "partner introduction" and not presented as verified fact; superlatives, prices and promises are not used.',
          'The partner is responsible for its offers (content, prices, redemption, statutory duties such as price information).',
        ],
      },
      {
        heading: '4. Prices, payment, term',
        paragraphs: [
          'The plans are subscriptions. Price, currency, taxes and term are shown in the Stripe checkout before the contract is concluded. The subscription renews automatically unless cancelled through the customer portal at the end of the term. On payment failure or cancellation the bonus ends when the paid term ends; offers are then no longer shown.',
        ],
      },
      {
        heading: '5. Suspension',
        paragraphs: [
          'We may suspend partners if content is unlawful, misleading or inaccurate, in case of abuse (e.g. manipulating redemptions) or for good cause. Fees already paid for the period of a justified suspension are not refunded.',
        ],
      },
      {
        heading: '6. Privacy',
        paragraphs: [
          'The privacy policy applies to the partner’s account data. Partners do not receive personal data of users when redeeming.',
        ],
      },
      {
        heading: '7. Liability, law',
        paragraphs: [
          'We are liable without limitation for intent and gross negligence and for injury to life, body or health; for simple negligence only for breach of essential contractual obligations and limited to foreseeable, typical damage. German law applies, excluding the UN Convention on Contracts for the International Sale of Goods.',
          `Contact: ${v(o.email)}. Version: ${LEGAL_VERSION}.`,
        ],
      },
    ],
  };
}

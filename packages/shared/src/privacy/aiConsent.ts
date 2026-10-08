/** Changes whenever recipients or the disclosed personalized AI data materially change. */
export const AI_CONSENT_VERSION = '2026-10-08-v1';

export interface AiConsentState {
  granted: boolean;
  version: string | null;
  updatedAt: number | null;
}

export const AI_CONSENT_COPY = {
  de: {
    title: 'Persönliche KI-Touren erlauben?',
    body: 'Für neue persönliche Erzählungen und Empfehlungen senden wir ausgewählte Orte und ihre Reihenfolge, deine gewählten Interessen, Sprache und den Erzählrahmen an Google Gemini. Den daraus erzeugten Text sowie Sprache und Stimme senden wir zur Sprachausgabe an Google oder OpenAI. Keine Konto-, Telefon-, E-Mail-, Geräte- oder Sitzungskennungen und keine genaue GPS-Position werden an diese KI-Dienste gesendet. Die Ortsfolge kann dennoch Rückschlüsse auf deinen Weg zulassen. Die Anbieter können Daten außerhalb der EU verarbeiten. Deine Zustimmung ist freiwillig und in Einstellungen → Datenschutz widerrufbar. Ohne Zustimmung bleiben kostenlose Textkarten, Routen und bereits gespeicherte Aufnahmen nutzbar; es entstehen keine neuen persönlichen KI-Aufnahmen.',
    allow: 'Zustimmen',
    decline: 'Ohne persönliche KI',
    setting: 'Persönliche KI-Touren',
    hint: 'Freiwillige Weitergabe von Tourkontext an Google Gemini und von Erzähltext an Google / OpenAI. Bestehende Aufnahmen bleiben beim Widerruf erhalten.',
    failed:
      'Die KI-Datenschutzeinstellung konnte nicht geladen oder gespeichert werden. Bitte versuche es erneut.',
  },
  en: {
    title: 'Allow personalized AI tours?',
    body: 'For new personalized stories and recommendations, we send selected places and their order, your chosen interests, language and story context to Google Gemini. The resulting text, language and voice are sent to Google or OpenAI for speech generation. We do not send account, phone, email, device or session identifiers, or precise GPS coordinates to these AI services. The place sequence can still reveal information about your route. Providers may process data outside the EU. Consent is optional and can be withdrawn in Settings → Privacy. Without consent, free text cards, routes and existing recordings remain available; no new personalized AI recordings are created.',
    allow: 'Allow',
    decline: 'Continue without personalized AI',
    setting: 'Personalized AI tours',
    hint: 'Optional sharing of tour context with Google Gemini and story text with Google / OpenAI. Withdrawing consent keeps existing recordings.',
    failed: 'Could not load or save your AI privacy choice. Please try again.',
  },
} as const;

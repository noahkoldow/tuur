import { spokenName } from '../narration/prompt';
import type { TourConcept } from '../routing/tour';
import type { TourConceptInput } from '../routing/tourPrompt';

const TEMPLATE_TITLES: Record<string, { de: string; en: string }> = {
  highlights60: { de: 'Highlights in 60 Minuten', en: 'Highlights in 60 minutes' },
  grand120: { de: 'Große Runde in 2 Stunden', en: 'Grand tour in 2 hours' },
  theme_history: { de: 'Geschichte erleben', en: 'Living history' },
  theme_architecture: { de: 'Architektur entdecken', en: 'Discover the architecture' },
  theme_art_culture: { de: 'Kunst und Kultur', en: 'Art and culture' },
  theme_culinary: { de: 'Kulinarischer Streifzug', en: 'Culinary stroll' },
  theme_nature: { de: 'Natur und Aussicht', en: 'Nature and views' },
};

/**
 * Deterministic, fact-free tour texts built from names and walking times only. Used by the mock provider, the
 * demo backend and as a safe fallback when model output fails validation.
 */
export function fallbackTourConcept(i: TourConceptInput): TourConcept {
  const de = i.lang === 'de';
  const t = TEMPLATE_TITLES[i.templateId];
  const title = t ? (de ? t.de : t.en) : de ? `Tour durch ${i.placeName}` : `Tour of ${i.placeName}`;
  const first = spokenName(i.stops[0]?.name ?? i.placeName);
  const last = spokenName(i.stops[i.stops.length - 1]?.name ?? i.placeName);
  return {
    title,
    teaser: de
      ? `Von ${first} bis ${last}.`
      : `From ${first} to ${last}.`,
    description: de
      ? `Diese Tour führt dich von ${first} bis ${last}. Unterwegs erzählt tuur an jeder Station eine eigene Geschichte.`
      : `This tour leads you from ${first} to ${last}. Along the way tuur tells a story at every stop.`,
    intro: de
      ? `Willkommen in ${spokenName(i.placeName)}. Wir starten bei ${first}.`
      : `Welcome to ${spokenName(i.placeName)}. We start at ${first}.`,
    transitions: i.stops.slice(1).map((s, n) => ({
      fromPoiId: i.stops[n]!.id,
      toPoiId: s.id,
      text: de
        ? `Weiter geht es zu ${spokenName(s.name)}, etwa ${Math.max(1, Math.round(s.walkMinutesFromPrev))} Minuten zu Fuß.`
        : `Next is ${spokenName(s.name)}, about ${Math.max(1, Math.round(s.walkMinutesFromPrev))} minutes on foot.`,
    })),
    outro: de
      ? 'Das war unsere Tour. Danke, dass du mit tuur unterwegs waren.'
      : 'That was our tour. Thank you for exploring with tuur.',
  };
}

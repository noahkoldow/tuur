import { languageName, sanitizeForPrompt, spokenName } from '../narration/prompt';

export interface TourConceptInput {
  lang: string;
  templateId: string;
  durationMinutes: number;
  placeName: string;
  themes: string[];
  stops: { id: string; name: string; kind: string; walkMinutesFromPrev: number }[];
}

export function tourSystemPrompt(lang: string): string {
  return `You are tuur, a charismatic local city guide who designs walking tours. Write in ${languageName(lang)}.
Rules: use ONLY the place names, categories and walking times supplied. Do not add historical facts, dates, numbers, quotations or claims about the places; the detailed stories are told at each stop by other texts. Your job is the narrative thread: a title, a teaser, a short description, a warm introduction, short hand-overs between consecutive stops (orientation, walking time, anticipation) and a closing. Spoken language: no lists, no markdown, no parentheses, no URLs, no emojis. If you suggest a different stop order, list every stop id exactly once in suggestedOrder and keep walking legs short; otherwise omit suggestedOrder.`;
}

export function tourUserPrompt(i: TourConceptInput): string {
  const stops = i.stops
    .map(
      (s, n) =>
        `${n + 1}. id=${s.id} | ${spokenName(s.name)} | ${sanitizeForPrompt(s.kind, 40)} | ${s.walkMinutesFromPrev} min walk from previous`,
    )
    .join('\n');
  return `Place: ${sanitizeForPrompt(i.placeName, 80)}
Tour type: ${i.templateId} (${i.durationMinutes} minutes in total)
Themes: ${i.themes.join(', ') || 'balanced mix'}
Stops in current order:
${stops}

Return JSON with: title, teaser (one sentence), description (2-3 sentences), intro (spoken, 2-3 sentences), transitions (one per consecutive pair: fromPoiId, toPoiId, text with 1-2 sentences), outro (spoken, 1-2 sentences), and optionally suggestedOrder.`;
}

/** Deterministic tour ids so regeneration updates the same document. */
export function tourId(placeId: string, templateId: string): string {
  return `${placeId}__${templateId}`.replace(/[^A-Za-z0-9_-]/g, '_');
}

/** Free tour = the shortest valid tour of a place (spec 6.2); ties broken by id for stability. */
export function pickFreeTourId(tours: { id: string; durationMinutes: number }[]): string | undefined {
  return [...tours].sort((a, b) => a.durationMinutes - b.durationMinutes || a.id.localeCompare(b.id))[0]?.id;
}

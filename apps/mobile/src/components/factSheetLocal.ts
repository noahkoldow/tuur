import { fallbackFactSheet, type FactSheet, type Poi } from '@tuur/shared';
import { placeInformation } from './placeDetails';

/** Deterministic fact sheet built on the device from the text and tags already on the place (no network, no AI). */
export function localFactSheet(poi: Poi | undefined, lang: string): FactSheet | undefined {
  if (!poi) return undefined;
  const language = lang.trim().toLowerCase().split(/[-_]/)[0] ?? 'en';
  const information = placeInformation(poi, language);
  if (!information) return undefined;
  return fallbackFactSheet({ text: information.text, osmTags: poi.osmTags, lang: language });
}

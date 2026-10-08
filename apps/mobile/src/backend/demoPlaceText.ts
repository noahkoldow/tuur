import type { Poi } from '@tuur/shared';

const categories: Record<string, [string, string]> = {
  monument: ['Denkmal', 'monument'],
  memorial: ['Gedenkort', 'memorial'],
  museum: ['Museum', 'museum'],
  park: ['Park', 'park'],
  garden: ['Garten', 'garden'],
  artwork: ['Kunstwerk', 'artwork'],
  viewpoint: ['Aussichtspunkt', 'viewpoint'],
  cafe: ['Café', 'café'],
  pub: ['Pub', 'pub'],
  restaurant: ['Restaurant', 'restaurant'],
  theatre: ['Theater', 'theatre'],
  place_of_worship: ['religiöser Ort', 'place of worship'],
  building: ['historisches Gebäude', 'historic building'],
  castle: ['Burg oder Schloss', 'castle'],
  city_gate: ['Stadttor', 'city gate'],
  books: ['Buchhandlung', 'bookshop'],
  attraction: ['Sehenswürdigkeit', 'visitor attraction'],
};

/** Local preview copy based only on fixture tags, never represented as a Wikipedia quotation. */
export function withDemoPlaceText(poi: Poi): Poi {
  if (poi.adminFacts.length || Object.keys(poi.osmTags).some((tag) => tag.startsWith('description')))
    return poi;
  const kind = [
    poi.osmTags.historic,
    poi.osmTags.amenity,
    poi.osmTags.leisure,
    poi.osmTags.shop,
    poi.osmTags.tourism,
  ]
    .map((tag) => (tag ? categories[tag] : undefined))
    .find(Boolean) ?? ['Ort', 'place'];
  return {
    ...poi,
    osmTags: {
      ...poi.osmTags,
      'tuur:demo': 'yes',
      'description:de': `${poi.name} ist in den Demo-Ortsdaten als ${kind[0]} erfasst. Schau dir den Ort und seine Umgebung an: Welche Formen, Materialien und Einzelheiten fallen dir auf? Diese Beispielkarte zeigt, wie du eine Tour ohne Audio lesen kannst.`,
      'description:en': `${poi.name} is listed as a ${kind[1]} in the demo place data. Look at the place and its surroundings: which shapes, materials and details catch your eye? This sample card shows how you can read a tour without audio.`,
    },
  };
}

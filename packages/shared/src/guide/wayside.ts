import { distanceMeters, type LatLng } from '../geo/geohash';
import { isLocalContextPoi } from '../poi/localContext';
import { normalizeName } from '../poi/merge';
import type { Poi } from '../schemas';

/** A short observation on the existing line of travel, keeping the chosen destination intact. */
export function pickWaysideStop(input: {
  from: LatLng;
  to: LatLng;
  candidates: Poi[];
  seenIds: string[];
  seenNames?: string[];
}): Poi | undefined {
  const remaining = distanceMeters(input.from, input.to);
  if (remaining < 450) return undefined;
  const seen = new Set(input.seenIds);
  const names = new Set(
    [...(input.seenNames ?? []), ...input.candidates.filter((p) => seen.has(p.id)).map((p) => p.name)].map(
      normalizeName,
    ),
  );
  return input.candidates
    .filter(
      (p) =>
        !seen.has(p.id) &&
        !names.has(normalizeName(p.name)) &&
        !p.hidden &&
        p.accessible &&
        !p.partnerId &&
        isLocalContextPoi(p),
    )
    .map((p) => ({
      p,
      ahead: distanceMeters(input.from, p.location),
      onward: distanceMeters(p.location, input.to),
    }))
    .filter(
      ({ ahead, onward }) =>
        ahead >= 45 && ahead <= 220 && onward < remaining && ahead + onward - remaining <= 50,
    )
    .sort((a, b) => a.ahead - b.ahead || b.p.score - a.p.score || a.p.id.localeCompare(b.p.id))[0]?.p;
}

import { describe, expect, it } from 'vitest';
import { REGION_FIXTURES } from '../fixtures/regions';
import { distanceMeters } from '../geo/geohash';
import { buildPois } from '../poi/pipeline';
import { ROAM_START_MAX_M, rankRoamStarts } from './roam';

const pois = buildPois(REGION_FIXTURES[0]!.raw, { now: 1_700_000_000_000 }).pois;
const here = { lat: 52.5165, lng: 13.3905 };

describe('rankRoamStarts', () => {
  it('offers nearby, accessible POIs only, best value first and deterministic', () => {
    const starts = rankRoamStarts(here, pois, []);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.length).toBeLessThanOrEqual(5);
    for (const p of starts) {
      expect(distanceMeters(here, p.location)).toBeLessThanOrEqual(ROAM_START_MAX_M);
      expect(p.accessible && !p.hidden).toBe(true);
    }
    expect(rankRoamStarts(here, pois, []).map((p) => p.id)).toEqual(starts.map((p) => p.id));
  });

  it('prefers matching interests and returns nothing when everything is too far', () => {
    const all = rankRoamStarts(here, pois, [], 50);
    const interest = all.find((p) => p.interests.length > 0)!.interests[0]!;
    const rankOf = (list: { interests: string[] }[]) => list.findIndex((p) => p.interests.includes(interest));
    expect(rankOf(rankRoamStarts(here, pois, [interest], 50))).toBeLessThanOrEqual(rankOf(all));
    expect(rankRoamStarts(here, pois, [interest], 50)[0]!.interests).toContain(interest);
    expect(rankRoamStarts({ lat: 0, lng: 0 }, pois, [])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { destinationPoint } from '../geo/geohash';
import { pickRoamTarget } from '../guide/roam';
import { pickWaysideStop } from '../guide/wayside';
import { filterOsmTags } from '../narration/sources';
import { planCustomRoute } from '../routing/planRoute';
import { DEFAULT_TEMPLATES, planTour } from '../routing/autoTours';
import { buildPois } from './pipeline';
import { buildOverpassQuery, parseOverpass } from './raw';

const origin = { lat: 52.52, lng: 13.4 };
const street = (id: number, meters: number, tags: Record<string, string> = {}) =>
  buildPois(
    [
      {
        source: 'osm' as const,
        sourceId: `way/${id}`,
        name: `Street ${id}`,
        location: destinationPoint(origin, 90, meters),
        osmTags: { name: `Street ${id}`, highway: 'residential', ...tags },
      },
    ],
    { now: 1 },
  ).pois[0]!;

describe('small places in sparse areas', () => {
  it('keeps a real street as a brief stop, without treating its name as history', () => {
    const poi = street(1, 160);
    expect(poi.interests).toEqual(['hidden_gems']);
    expect(poi.score).toBeGreaterThanOrEqual(15);
    expect(poi.dwellMinutes).toBe(1);
    expect(poi.adminFacts).toEqual([]);
    expect(street(2, 200, { access: 'private' }).accessible).toBe(false);
    expect(street(3, 200, { foot: 'no' }).accessible).toBe(false);
  });

  it('plans a sparse-area walk even when there is no major landmark', () => {
    const pois = [street(1, 120), street(2, 300), street(3, 500)];
    const route = planCustomRoute({
      start: origin,
      budgetMinutes: 30,
      profile: 'foot-walking',
      interests: [],
      pois,
    });
    expect(route?.stops.length).toBeGreaterThan(0);
    expect(route!.totalMinutes).toBeLessThanOrEqual(30);
    const local = planTour(
      pois,
      DEFAULT_TEMPLATES.find((t) => t.id === 'local_walk')!,
    );
    expect(local?.plan.issues).toEqual([]);
    expect(local!.plan.stops.length).toBeGreaterThanOrEqual(2);
  });

  it('uses nearby details for a gap, while preferring a main stop that is already close', () => {
    const detail = street(1, 140);
    const landmark = { ...street(2, 600), osmTags: { historic: 'castle' }, score: 95, rawScore: 80 };
    const input = {
      pos: origin,
      heading: 90,
      mode: 'walking' as const,
      speedMps: 1.3,
      candidates: [detail, landmark],
      seenIds: [],
      interests: [],
      frequency: 'normal' as const,
    };
    expect(pickRoamTarget(input)?.id).toBe(detail.id);
    expect(
      pickRoamTarget({
        ...input,
        candidates: [detail, { ...landmark, location: destinationPoint(origin, 90, 250) }],
      })?.id,
    ).toBe(landmark.id);
    expect(pickRoamTarget({ ...input, candidates: [detail], seenIds: [detail.id] })).toBeUndefined();
  });

  it('only fills long walks with unseen, public details along the route', () => {
    const detail = street(1, 150);
    const input = { from: origin, to: destinationPoint(origin, 90, 800), candidates: [detail], seenIds: [] };
    expect(pickWaysideStop(input)?.id).toBe(detail.id);
    expect(pickWaysideStop({ ...input, to: destinationPoint(origin, 90, 300) })).toBeUndefined();
    expect(pickWaysideStop({ ...input, seenNames: [detail.name] })).toBeUndefined();
    expect(pickWaysideStop({ ...input, candidates: [{ ...detail, hidden: true }] })).toBeUndefined();
    expect(pickWaysideStop({ ...input, candidates: [{ ...detail, accessible: false }] })).toBeUndefined();
    expect(
      pickWaysideStop({ ...input, candidates: [{ ...detail, location: destinationPoint(origin, 0, 150) }] }),
    ).toBeUndefined();
  });

  it('uses an actual street vertex instead of the bounding-box center', () => {
    const raw = parseOverpass({
      elements: [
        {
          type: 'way',
          id: 1,
          center: { lat: 52, lon: 13 },
          geometry: [
            { lat: 52.52, lon: 13.4 },
            { lat: 52.52, lon: 13.41 },
          ],
          tags: { name: 'River Street', highway: 'residential' },
        },
      ],
    });
    expect(raw[0]!.location).toEqual({ lat: 52.52, lng: 13.41 });
    const query = buildOverpassQuery({ south: 52, west: 13, north: 53, east: 14 });
    expect(query).toContain('neighbourhood');
    expect(query).toContain('geom 500');
  });

  it('passes documented street-name origins in the requested source language', () => {
    expect(
      filterOsmTags(
        {
          name: 'Lindenweg',
          highway: 'residential',
          'name:etymology': 'trees',
          'name:etymology:de': 'Linden',
          private_note: 'omit',
        },
        'de',
      ),
    ).toEqual({ name: 'Lindenweg', highway: 'residential', 'name:etymology': 'Linden' });
  });
});

import { describe, expect, it } from 'vitest';
import { encodePolyline } from '../routing/polyline';
import type { Tour, TourStop } from '../routing/tour';
import { buildTourGpx, GpxExportError } from './gpx';

const points: [number, number][] = [
  [52.51631, 13.37777],
  [52.51635, 13.3782],
  [52.5169, 13.3788],
];
const stop = (order: number, name = `Place ${order}`): TourStop => ({
  poiId: `poi-${order}`,
  order,
  name,
  location: { lat: 52.51631 + order / 1000, lng: 13.37777 },
  dwellMinutes: 5,
  walkMinutesFromPrev: 3,
  partner: false,
});
const tour = { path: encodePolyline(points), stops: [stop(1, 'Museum'), stop(0, 'Gate')] };

describe('downloaded tour GPX export', () => {
  it('preserves every stored path point and exports stops separately in their numbered order', () => {
    const before = structuredClone(tour);
    const { xml, fileName } = buildTourGpx(tour, 'Berlin walk');
    expect(fileName).toBe('tuur-Berlin-walk.gpx');
    expect(xml).toContain('<gpx version="1.1" creator="tuur" xmlns="http://www.topografix.com/GPX/1/1">');
    expect(
      [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"\/>/g)].map((match) => [
        Number(match[1]),
        Number(match[2]),
      ]),
    ).toEqual(points);
    expect([...xml.matchAll(/<wpt [^>]+><name>([^<]+)<\/name><\/wpt>/g)].map((match) => match[1])).toEqual([
      '1. Gate',
      '2. Museum',
    ]);
    expect(xml.indexOf('<metadata>')).toBeLessThan(xml.indexOf('<wpt'));
    expect(xml.indexOf('<wpt')).toBeLessThan(xml.indexOf('<trk>'));
    expect(xml).not.toMatch(/<(?:rte|ele|time|extensions|author|link)\b/);
    expect(tour).toEqual(before);
  });

  it('escapes XML and removes invalid characters while preserving Unicode labels', () => {
    const { xml } = buildTourGpx(
      { ...tour, stops: [stop(0, 'A&B <gate> "one" \'two\'')] },
      'Berlin \u0000\ud800\ufffe & <Museum> 🎨',
    );
    expect(xml).toContain('<metadata><name>Berlin &amp; &lt;Museum&gt; 🎨</name></metadata>');
    expect(xml).toContain('<name>1. A&amp;B &lt;gate&gt; &quot;one&quot; &apos;two&apos;</name>');
    for (const invalid of ['\u0000', '\ud800', '\ufffe']) expect(xml).not.toContain(invalid);
  });

  it.each(['../CON:*?"<>|\\escape', '...', '  ', '😀'.repeat(200), '東京'.repeat(100)])(
    'creates a bounded safe file name from %s',
    (title) => {
      const { fileName } = buildTourGpx(tour, title);
      expect(fileName).toMatch(/^tuur-[\p{L}\p{N}\p{M}_-]+\.gpx$/u);
      expect(Buffer.byteLength(fileName, 'utf8')).toBeLessThan(255);
      expect(fileName).not.toMatch(/[\\/:*?"<>|]/);
    },
  );

  it('truncates text without cutting a Unicode surrogate pair and uses a neutral fallback title', () => {
    const { xml } = buildTourGpx(tour, '🎨'.repeat(200));
    expect(xml).toContain(`<name>${'🎨'.repeat(160)}</name>`);
    expect(buildTourGpx(tour).xml).toContain('<name>tuur Tour</name>');
  });

  it('uses a stored tour title as fallback without copying private payload fields', () => {
    const input = {
      ...tour,
      texts: {
        de: {
          title: 'Stored title',
          teaser: 'secret teaser',
          description: 'private description',
          intro: '',
          transitions: [],
          outro: '',
        },
      },
      id: 'planned_private-user',
      access: { token: 'private-receipt' },
      narrations: { audioUrl: 'https://private.example/audio?token=secret' },
    };
    const { xml, fileName } = buildTourGpx(input);
    expect(xml).toContain('<name>Stored title</name>');
    expect(fileName).toBe('tuur-Stored-title.gpx');
    expect(xml).not.toMatch(/private|secret|token|audioUrl|receipt|planned/);
  });

  it('outputs GPX-valid decimal coordinates, including tiny values and the date line', () => {
    const { xml } = buildTourGpx({
      path: encodePolyline([
        [90, 180],
        [-90, -180],
      ]),
      stops: [{ ...stop(0), location: { lat: 1e-7, lng: -1e-8 } }],
    });
    expect(xml).toContain('<wpt lat="0.0000001" lon="-0.00000001">');
    expect(xml).toContain('<trkpt lat="90" lon="-180"/>');
    expect(xml).toContain('<trkpt lat="-90" lon="-180"/>');
    expect(xml).not.toMatch(/(?:lat|lon)="[^"]*[eE]/);
  });

  it('rejects a missing route instead of joining the stops with invented lines', () => {
    expect(() => buildTourGpx({ ...tour, path: '' })).toThrowError(
      expect.objectContaining({ code: 'missing_route' }),
    );
  });

  it.each([
    '?',
    '???',
    '~~~~~~~?',
    'not a polyline',
    '😃',
    encodePolyline([
      [91, 0],
      [0, 0],
    ]),
    encodePolyline([
      [0, 181],
      [0, 0],
    ]),
    encodePolyline([[52, 13]]),
    encodePolyline([
      [52, 13],
      [52, 13],
    ]),
    `${tour.path}?`,
    tour.path.slice(0, -1),
  ])('rejects malformed, incomplete or unusable paths: %s', (path) => {
    expect(() => buildTourGpx({ ...tour, path })).toThrowError(
      expect.objectContaining({ code: 'invalid_route' }),
    );
  });

  it.each([
    { lat: NaN, lng: 13 },
    { lat: 52, lng: Infinity },
    { lat: 90.01, lng: 0 },
    { lat: 0, lng: -180.01 },
  ])('rejects invalid stop coordinates: %j', (location) => {
    expect(() => buildTourGpx({ ...tour, stops: [{ ...stop(0), location }] })).toThrowError(
      expect.objectContaining({ code: 'invalid_stop' }),
    );
  });

  it.each([
    { stops: [] },
    { stops: [stop(0), stop(0)] },
    { stops: [{ ...stop(0), order: -1 }] },
    { stops: [{ ...stop(0), order: 0.5 }] },
  ])('rejects missing or ambiguous stops', ({ stops }) => {
    expect(() => buildTourGpx({ ...tour, stops })).toThrow(GpxExportError);
  });

  it('rejects an unexpectedly large path before decoding it', () => {
    expect(() => buildTourGpx({ ...tour, path: '?'.repeat(1_000_001) })).toThrowError(
      expect.objectContaining({ code: 'invalid_route' }),
    );
  });

  it('exports an existing approximate path unchanged without inventing extra geometry', () => {
    const approximate = { ...tour, routingSource: 'approx' as Tour['routingSource'] };
    expect(buildTourGpx(approximate).xml).toBe(buildTourGpx(tour).xml);
  });
});

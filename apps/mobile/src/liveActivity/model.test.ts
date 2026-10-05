import { describe, expect, it } from 'vitest';
import type { GuideUi } from '../guide/runtime';
import { buildLiveActivityContent } from './model';

function snapshot(patch: Partial<GuideUi> = {}): GuideUi {
  return {
    phase: 'approaching',
    stops: [
      { id: 'a', name: 'Museum', location: { lat: 52.123456, lng: 13.654321 }, state: 'visited' },
      { id: 'b', name: 'Square', location: { lat: 52.234567, lng: 13.765432 }, state: 'current' },
      { id: 'c', name: 'Park', location: { lat: 52.345678, lng: 13.876543 }, state: 'upcoming' },
    ],
    index: 1,
    target: { id: 'b', name: 'Square', distanceM: 243 },
    positionMs: 0,
    playing: false,
    paragraphIndex: 0,
    travelMode: 'walking',
    awaitingRoute: false,
    user: { lat: 52.456789, lng: 13.987654 },
    ...patch,
  };
}

const options = {
  mode: 'tour' as const,
  title: 'Berlin stories',
  lang: 'en',
  navigation: { status: 'ready' as const, distanceM: 243 },
};

describe('Live Activity presentation', () => {
  it('uses the routed distance and shows no straight-line fallback while directions fail', () => {
    expect(
      buildLiveActivityContent(snapshot(), {
        ...options,
        navigation: { status: 'ready', distanceM: 610 },
      }),
    ).toMatchObject({ distance: '610 m · along route', compactText: '610 m' });
    expect(
      buildLiveActivityContent(snapshot(), {
        ...options,
        navigation: { status: 'error' },
      }),
    ).toMatchObject({ distance: '', status: 'Open tuur to retry directions' });
  });
  it('shows the next stop, qualified distance and route progress without location data', () => {
    const result = buildLiveActivityContent(snapshot(), options)!;
    expect(result).toMatchObject({
      title: 'Square',
      subtitle: 'Berlin stories',
      status: 'Next stop',
      distance: '240 m · along route',
      compactText: '240 m',
      progress: '1 of 3 stops done',
      progressValue: 1 / 3,
      staleStatus: 'Open tuur for an update',
      staleCompact: 'Open',
    });
    const payload = JSON.stringify(result);
    for (const privateField of ['52.123456', '13.654321', '52.456789', '13.987654', 'heading']) {
      expect(payload).not.toContain(privateField);
    }
    expect(Object.values(result).every((value) => ['string', 'number'].includes(typeof value))).toBe(true);
  });

  it('localises regional German tags and kilometre decimals', () => {
    const result = buildLiveActivityContent(
      snapshot({ target: { id: 'b', name: 'Platz', distanceM: 1234 } }),
      { ...options, lang: 'de-DE', navigation: { status: 'ready', distanceM: 1234 } },
    );
    expect(result).toMatchObject({
      title: 'Platz',
      status: 'Nächste Station',
      distance: '1,2 km · entlang der Route',
      compactText: '1,2 km',
      progress: '1 von 3 Stationen erledigt',
      staleStatus: 'tuur für ein Update öffnen',
      staleCompact: 'Öffnen',
    });
  });

  it('uses English as the supported fallback without passing unsupported locale tags to Intl', () => {
    expect(buildLiveActivityContent(snapshot(), { ...options, lang: 'not_a_language' })?.status).toBe(
      'Next stop',
    );
  });

  it('discards stale distance and tells the listener how to refresh it', () => {
    expect(buildLiveActivityContent(snapshot(), { ...options, locationStale: true })).toMatchObject({
      status: 'Open tuur to update your position',
      distance: '',
      compactText: 'GPS',
      symbol: 'location.slash',
    });
  });

  it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'treats an unusable distance (%s) as awaiting GPS',
    (distanceM) => {
      const result = buildLiveActivityContent(snapshot({ target: { id: 'b', name: 'Square', distanceM } }), {
        ...options,
        navigation: { status: 'waiting_location', distanceM },
      });
      expect(result).toMatchObject({ status: 'Waiting for GPS', distance: '', compactText: 'GPS' });
    },
  );

  it('shows arrival only with a fresh nearby fix', () => {
    const ui = snapshot({ target: { id: 'b', name: 'Square', distanceM: 0 } });
    expect(
      buildLiveActivityContent(ui, { ...options, navigation: { status: 'ready', distanceM: 0 } }),
    ).toMatchObject({
      status: 'You have arrived',
      distance: '0 m · along route',
      compactText: 'Here',
    });
    expect(buildLiveActivityContent(ui, { ...options, locationStale: true })?.status).toBe(
      'Open tuur to update your position',
    );
  });

  it('keeps pause visible and also explains stale location', () => {
    const result = buildLiveActivityContent(snapshot({ phase: 'paused' }), {
      ...options,
      locationStale: true,
    });
    expect(result).toMatchObject({
      status: 'Tour paused',
      subtitle: 'Open tuur to update your position',
      distance: '',
      compactText: 'Pause',
    });
  });

  it('shows the current narration title only while that stop is being narrated', () => {
    const narration: NonNullable<GuideUi['narration']> = {
      poiId: 'b',
      kind: 'stop',
      tier: 'short',
      title: 'Stories from the square',
      text: 'Private transcript that should not be serialized',
      paragraphs: [],
      images: [],
      key: 'private-cache-key',
      aiGenerated: true,
    };
    const result = buildLiveActivityContent(
      snapshot({ phase: 'narrating', narration, playing: true }),
      options,
    );
    expect(result).toMatchObject({
      title: 'Stories from the square',
      status: 'Guide speaking',
      symbol: 'speaker.wave.2.fill',
      compactText: 'Audio',
    });
    expect(JSON.stringify(result)).not.toContain(narration.text);
    expect(JSON.stringify(result)).not.toContain(narration.key);
    expect(buildLiveActivityContent(snapshot({ narration }), options)?.title).toBe('Square');
    expect(
      buildLiveActivityContent(
        snapshot({ phase: 'narrating', narration: { ...narration, kind: 'transition' } }),
        options,
      )?.title,
    ).toBe('Square');
  });

  it('prompts a crossroads choice without reusing the old target or fixed-route total', () => {
    expect(
      buildLiveActivityContent(snapshot({ awaitingRoute: true }), { ...options, mode: 'fork' }),
    ).toMatchObject({
      title: 'Berlin stories',
      status: 'Choose your next stop in tuur',
      distance: '',
      progress: '1 stop visited',
      compactText: 'Choose',
    });
  });

  it('never pairs a previous narration title with the next stop distance', () => {
    const result = buildLiveActivityContent(
      snapshot({
        phase: 'narrating',
        playing: true,
        narration: {
          poiId: 'a',
          kind: 'stop',
          tier: 'short',
          title: 'The museum story',
          text: '',
          paragraphs: [],
          images: [],
          key: 'a:short',
          aiGenerated: true,
        },
      }),
      options,
    );
    expect(result).toMatchObject({
      title: 'Square',
      distance: '240 m · along route',
      status: 'Guide speaking',
    });
  });

  it('does not claim that narration is playing while the audio is still preparing', () => {
    const ui = snapshot({ phase: 'narrating', playing: false });
    expect(buildLiveActivityContent(ui, options)).toMatchObject({
      status: 'Preparing audio',
      symbol: 'hourglass',
      compactText: 'Audio',
    });
    expect(buildLiveActivityContent(ui, { ...options, lang: 'de' })?.status).toBe('Audio wird vorbereitet');
  });

  it('keeps roam active while it searches automatically, including an initially empty route', () => {
    const ui = snapshot({ phase: 'idle', stops: [], target: undefined, awaitingRoute: true });
    expect(buildLiveActivityContent(ui, { mode: 'roam', lang: 'de' })).toMatchObject({
      title: 'Streifzug',
      status: 'Suche nach Geschichten in der Nähe',
      distance: '',
      progress: '0 Stationen besucht',
      progressValue: 0,
    });
    expect(buildLiveActivityContent({ ...ui, user: undefined }, { mode: 'roam', lang: 'en' })?.status).toBe(
      'Waiting for GPS',
    );
  });

  it('counts skipped stops toward fixed-route progress without calling them visited in roam', () => {
    const ui = snapshot();
    ui.stops[2]!.state = 'skipped';
    expect(buildLiveActivityContent(ui, options)).toMatchObject({
      progress: '2 of 3 stops done',
      progressValue: 2 / 3,
    });
    expect(buildLiveActivityContent(ui, { ...options, mode: 'roam' })?.progress).toBe('1 stop visited');
  });

  it('ends the activity when the tour finishes', () => {
    expect(buildLiveActivityContent(snapshot({ phase: 'finished' }), options)).toBeNull();
  });

  it('bounds remote text and avoids broken emoji or line breaks in system surfaces', () => {
    const result = buildLiveActivityContent(
      snapshot({ target: { id: 'b', name: `  ${'🏛️'.repeat(300)}\n Square  `, distanceM: 243 } }),
      { ...options, title: 'A'.repeat(20_000) },
    )!;
    expect(Array.from(result.title)).toHaveLength(90);
    expect(result.title).not.toContain('\n');
    expect(result.title).not.toContain('\uFFFD');
    expect(Array.from(result.subtitle)).toHaveLength(90);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(4096);
  });
});

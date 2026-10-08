import { describe, expect, it, vi } from 'vitest';
import { PoiSchema, TourSchema, type SourceBundle } from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { getPoiText, POI_TEXT_RETRY_MS, POI_TEXT_TTL_MS, type PoiTextDeps } from './text';

const request = { poiId: 'gate', lang: 'de' };
function fixture() {
  const { db, docs } = memoryFirestore();
  let now = 1_800_000_000_000;
  const poi = PoiSchema.parse({
    id: 'gate',
    name: 'Brandenburger Tor',
    location: { lat: 52.5163, lng: 13.3777 },
    geohash: 'u33dbb',
    tile: 'u33dbb',
    interests: ['history'],
    score: 60,
    baseScore: 60,
    rawScore: 60,
    sources: {
      wikidataId: 'Q82425',
      wikipedia: [
        {
          lang: 'de',
          title: 'Brandenburger Tor',
          length: 80000,
          url: 'https://de.wikipedia.org/wiki/Brandenburger_Tor',
        },
        {
          lang: 'en',
          title: 'Brandenburg Gate',
          length: 40000,
          url: 'https://en.wikipedia.org/wiki/Brandenburg_Gate',
        },
      ],
    },
    updatedAt: now,
  });
  docs.set('pois/gate', poi);
  docs.set('areas/u33dbb', { placeId: 'berlin' });
  docs.set('users/free/credits/wallet', { balance: 0, rewardBalance: 0 });
  const bundle: SourceBundle = {
    poiName: poi.name,
    wikipedia: [
      {
        lang: 'de',
        title: 'Brandenburger Tor',
        extract: 'Das Brandenburger Tor wurde 1791 fertiggestellt.',
        url: 'https://ignored.example',
      },
      { lang: 'en', title: 'Brandenburg Gate', extract: 'The Brandenburg Gate was completed in 1791.' },
    ],
    facts: [],
    osmTags: {},
    adminFacts: [],
  };
  const gather = vi.fn(async () => bundle);
  const deps: PoiTextDeps = { db, sources: { gather }, now: () => now };
  return {
    deps,
    docs,
    gather,
    bundle,
    poi,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('free POI source information', () => {
  it('retrieves real source text without AI/audio dependencies, spending credits or overwriting the canonical POI', async () => {
    const { deps, docs, gather, poi } = fixture();
    const forbidden = vi.fn(() => {
      throw new Error('No model or audio allowed');
    });
    for (const key of ['llm', 'tts', 'encoder', 'store'])
      Object.defineProperty(deps, key, { get: forbidden });
    const result = await getPoiText(deps, 'free', {
      ...request,
      access: { mode: 'roam' },
      url: 'https://untrusted.invalid',
    });
    expect(result.sources.wikipedia[0]).toEqual({
      ...poi.sources.wikipedia[0],
      extract: 'Das Brandenburger Tor wurde 1791 fertiggestellt.',
    });
    expect(result.sources.wikipedia[1]?.extract).toContain('1791');
    expect(gather).toHaveBeenCalledWith(poi, ['de', 'en']);
    expect(forbidden).not.toHaveBeenCalled();
    expect(docs.get('pois/gate')).toEqual(poi);
    expect(docs.get('users/free/credits/wallet')).toEqual({ balance: 0, rewardBalance: 0 });
    expect(
      [...docs.keys()].every((key) =>
        ['pois/', 'areas/', 'users/free/credits/', 'rateLimits/poi_text_', 'poiTexts/'].some((prefix) =>
          key.startsWith(prefix),
        ),
      ),
    ).toBe(true);
  });

  it('shares fresh source cache across authorized users, retaining the current POI fields', async () => {
    const { deps, docs, gather, poi } = fixture();
    await getPoiText(deps, 'free', request);
    docs.set('pois/gate', { ...poi, adminFacts: ['A newly approved detail.'] });
    const result = await getPoiText(deps, 'other', request);
    expect(gather).toHaveBeenCalledTimes(1);
    expect(result.adminFacts).toEqual(['A newly approved detail.']);
    expect(result.sources.wikipedia[0]?.extract).toContain('1791');
  });

  it('refreshes source text after TTL expiry and after poi.updatedAt changes', async () => {
    const { deps, docs, gather, poi, advance } = fixture();
    await getPoiText(deps, 'free', request);
    advance(POI_TEXT_TTL_MS);
    await getPoiText(deps, 'free', request);
    expect(gather).toHaveBeenCalledTimes(2);
    docs.set('pois/gate', { ...poi, updatedAt: poi.updatedAt + 1 });
    await getPoiText(deps, 'free', request);
    expect(gather).toHaveBeenCalledTimes(3);
  });

  it('does not serve cached text for a hidden or deleted POI', async () => {
    const { deps, docs, gather, poi } = fixture();
    await getPoiText(deps, 'free', request);
    docs.set('pois/gate', { ...poi, hidden: true });
    await expect(getPoiText(deps, 'free', request)).rejects.toMatchObject({ code: 'not-found' });
    docs.delete('pois/gate');
    await expect(getPoiText(deps, 'free', request)).rejects.toMatchObject({ code: 'not-found' });
    expect(gather).toHaveBeenCalledTimes(1);
  });

  it('checks tour membership and private-route ownership even with a cached extract', async () => {
    const { deps, docs, gather } = fixture();
    await getPoiText(deps, 'free', request);
    docs.set('tours/other', { locked: false, stops: [{ poiId: 'elsewhere' }] });
    await expect(getPoiText(deps, 'free', { ...request, access: { tourId: 'other' } })).rejects.toMatchObject(
      { code: 'permission-denied' },
    );
    docs.set('users/owner/sessions/private', {
      kind: 'planned',
      placeId: 'berlin',
      expiresAt: deps.now() + 1000,
      stops: [{ poiId: 'gate' }],
    });
    await expect(
      getPoiText(deps, 'free', { ...request, access: { tourId: 'planned_private', mode: 'planned' } }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(gather).toHaveBeenCalledTimes(1);
  });

  it('rejects anonymous missing auth, invalid languages and document paths before source work', async () => {
    const { deps, docs, gather } = fixture();
    await expect(getPoiText(deps, undefined, request)).rejects.toMatchObject({ code: 'unauthenticated' });
    for (const input of [{ ...request, lang: 'evil.example' }, { ...request, poiId: 'a/b' }, {}])
      await expect(getPoiText(deps, 'free', input)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(gather).not.toHaveBeenCalled();
    expect([...docs.keys()].some((key) => key.startsWith('rateLimits/') || key.startsWith('poiTexts/'))).toBe(
      false,
    );
  });

  it('validates live group membership and the host private route for guest text without audio funding', async () => {
    const { deps, docs, poi, gather } = fixture();
    const tour = TourSchema.parse({
      id: 'planned_shared',
      placeId: 'berlin',
      source: 'planned',
      version: 1,
      template: 'planned',
      profile: 'foot-walking',
      themes: [],
      stops: [
        {
          poiId: poi.id,
          name: poi.name,
          order: 0,
          location: poi.location,
          dwellMinutes: 5,
          walkMinutesFromPrev: 0,
        },
      ],
      path: '',
      durationMinutes: 5,
      walkMinutes: 0,
      distanceMeters: 0,
      bbox: { south: 52.5, north: 52.52, west: 13.37, east: 13.4 },
      createdAt: deps.now(),
      updatedAt: deps.now(),
    });
    docs.set('users/host/sessions/shared', { ...tour, kind: 'planned', expiresAt: deps.now() + 1000 });
    const group = {
      id: 'group1234567',
      hostUid: 'host',
      tour,
      mode: 'planned',
      members: ['host', 'free'],
      hostSubscriber: false,
      extraSeats: 0,
      inviteHash: 'hash',
      status: 'live',
      createdAt: deps.now(),
      expiresAt: deps.now() + 1000,
    };
    docs.set('groups/group1234567', group);
    const grouped = { ...request, access: { mode: 'planned', tourId: tour.id, groupId: group.id } };
    expect((await getPoiText(deps, 'free', grouped)).sources.wikipedia[0]?.extract).toContain('1791');
    expect(
      [...docs.keys()].some((path) => path.includes('/entitlements/') || path.includes('/tourTime')),
    ).toBe(false);
    await expect(getPoiText(deps, 'outsider', grouped)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      getPoiText(deps, 'free', { ...grouped, access: { ...grouped.access, tourId: 'planned_foreign' } }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    for (const change of [
      { status: 'ended' },
      { expiresAt: deps.now() },
      { members: ['host'] },
      { tour: { ...tour, stops: [{ ...tour.stops[0], poiId: 'elsewhere' }] } },
    ]) {
      docs.set('groups/group1234567', { ...group, ...change });
      await expect(getPoiText(deps, 'free', grouped)).rejects.toMatchObject({ code: 'permission-denied' });
    }
    docs.set('groups/group1234567', group);
    docs.delete('users/host/sessions/shared');
    await expect(getPoiText(deps, 'free', grouped)).rejects.toMatchObject({ code: 'not-found' });
    expect(gather).toHaveBeenCalledTimes(1);
  });

  it.each(['empty', 'exception'])(
    'allows retry after only 30 seconds when sources fail: %s',
    async (failure) => {
      const { deps, docs, gather, bundle, advance } = fixture();
      if (failure === 'empty') gather.mockResolvedValue({ ...bundle, wikipedia: [] });
      else gather.mockRejectedValue(new Error('upstream unavailable'));
      await expect(getPoiText(deps, 'free', request)).rejects.toMatchObject({
        code: 'unavailable',
        details: { reason: 'poi_text_unavailable', retryAfterMs: POI_TEXT_RETRY_MS },
      });
      await expect(getPoiText(deps, 'other', request)).rejects.toMatchObject({ code: 'unavailable' });
      expect(gather).toHaveBeenCalledTimes(1);
      expect([...docs.values()].find((value) => value['poiId'] === 'gate')?.['expiresAt']).toBe(
        deps.now() + POI_TEXT_RETRY_MS,
      );
      advance(POI_TEXT_RETRY_MS);
      gather.mockResolvedValue(bundle);
      expect((await getPoiText(deps, 'free', request)).sources.wikipedia[0]?.extract).toContain('1791');
      expect(gather).toHaveBeenCalledTimes(2);
    },
  );

  it('returns a source-language fallback briefly when the preferred extract is temporarily unavailable', async () => {
    const { deps, gather, bundle, advance } = fixture();
    gather.mockResolvedValue({ ...bundle, wikipedia: [bundle.wikipedia[1]!] });
    expect((await getPoiText(deps, 'free', request)).sources.wikipedia[1]?.extract).toContain('1791');
    advance(5 * 60_000);
    gather.mockResolvedValue(bundle);
    expect((await getPoiText(deps, 'free', request)).sources.wikipedia[0]?.extract).toContain('1791');
    expect(gather).toHaveBeenCalledTimes(2);
  });

  it('only merges existing reference identities and bounds extract size', async () => {
    const { deps, gather, bundle } = fixture();
    gather.mockResolvedValue({
      ...bundle,
      wikipedia: [
        { lang: 'de', title: 'Unrelated page', extract: 'Do not merge this.' },
        { ...bundle.wikipedia[0]!, extract: 'a'.repeat(6000) },
      ],
    });
    const result = await getPoiText(deps, 'free', request);
    expect(result.sources.wikipedia).toHaveLength(2);
    expect(result.sources.wikipedia[0]?.extract).toHaveLength(5000);
    expect(result.sources.wikipedia[1]?.extract).toBeUndefined();
  });

  it('rate limits before using even a positive cache and keeps the source data unchanged', async () => {
    const { deps, docs, gather, poi } = fixture();
    await getPoiText(deps, 'free', request);
    docs.set('rateLimits/poi_text_user_free', { windowStart: deps.now(), count: 240 });
    await expect(getPoiText(deps, 'free', request)).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(gather).toHaveBeenCalledTimes(1);
    expect(docs.get('pois/gate')).toEqual(poi);
  });

  it('returns existing source text or a POI without Wikipedia without inventing facts', async () => {
    const { deps, docs, gather, poi } = fixture();
    docs.set('pois/gate', { ...poi, sources: { ...poi.sources, wikipedia: [] } });
    expect((await getPoiText(deps, 'free', request)).sources.wikipedia).toEqual([]);
    docs.set('pois/gate', {
      ...poi,
      sources: {
        ...poi.sources,
        wikipedia: [{ ...poi.sources.wikipedia[0], extract: 'Existing verified source text.' }],
      },
    });
    expect((await getPoiText(deps, 'free', request)).sources.wikipedia[0]?.extract).toBe(
      'Existing verified source text.',
    );
    expect(gather).not.toHaveBeenCalled();
  });
});

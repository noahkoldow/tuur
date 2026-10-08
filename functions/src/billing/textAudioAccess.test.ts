import { describe, expect, it, vi } from 'vitest';
import { buildPois, DEFAULT_AI_CONFIG, REGION_FIXTURES } from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { authorizeContent, authorizeTextContent, spendCredit } from './entitlements';
import { updateTourTime } from './timeBudget';
import { getNarration, type NarrationDeps } from '../narration/service';
import { getTransition } from '../narration/transition';
import { getTeaser, type TeaserDeps } from '../narration/teaser';
import { MockLlmProvider } from '../providers/llm';
import { MockNarrationSources } from '../providers/narrationSources';

function fixture() {
  const { db, docs } = memoryFirestore();
  const now = 1_800_000_000_000;
  const pois = buildPois(REGION_FIXTURES[0]!.raw, { now })
    .pois.slice(0, 2)
    .map((poi, i) => ({ ...poi, id: `p${i + 1}`, tile: 'u33dbb' }));
  pois.forEach((poi) => docs.set(`pois/${poi.id}`, poi));
  docs.set('tours/t', {
    id: 't',
    free: false,
    locked: false,
    placeId: 'berlin',
    stops: pois.map((poi) => ({ poiId: poi.id })),
  });
  docs.set('areas/u33dbb', { placeId: 'berlin' });
  docs.set('places/berlin', { name: 'Berlin' });
  docs.set('users/u/credits/wallet', { balance: 2, rewardBalance: 3, seatBalance: 0 });
  return { db, docs, now, pois, deps: { db, now: () => now } };
}

describe('free text and paid audio boundaries', () => {
  it('allows public text and dynamic navigation without reading or changing audio balances', async () => {
    const { docs, deps } = fixture();
    const before = structuredClone([...docs]);
    for (const access of [
      {},
      { tourId: 't', mode: 'tour' as const },
      { mode: 'roam' as const, tile: 'u33dbb' },
    ])
      expect(await authorizeTextContent(deps, 'u', { ...access, poiIds: ['p1'] })).toEqual({
        reason: 'text',
      });
    expect([...docs]).toEqual(before);
    expect([...docs.keys()].some((key) => key.includes('/tourTime'))).toBe(false);
  });

  it('keeps hidden POIs, locked tours, unrelated stops and another user private route inaccessible', async () => {
    const { docs, deps } = fixture();
    docs.set('users/other/sessions/private', {
      kind: 'planned',
      placeId: 'berlin',
      expiresAt: deps.now() + 1000,
      stops: [{ poiId: 'p1' }],
    });
    await expect(
      authorizeTextContent(deps, 'u', { tourId: 'planned_private', mode: 'planned', poiIds: ['p1'] }),
    ).rejects.toMatchObject({ code: 'not-found' });
    docs.get('tours/t')!.stops = [{ poiId: 'p2' }];
    await expect(authorizeTextContent(deps, 'u', { tourId: 't', poiIds: ['p1'] })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    docs.get('tours/t')!.locked = true;
    await expect(authorizeTextContent(deps, 'u', { tourId: 't', poiIds: ['p2'] })).rejects.toMatchObject({
      code: 'not-found',
    });
    docs.get('pois/p1')!.hidden = true;
    await expect(authorizeTextContent(deps, 'u', { poiIds: ['p1'] })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('retrieves an unpaid text teaser without touching any audio dependency, credit or time budget', async () => {
    const { deps, docs, pois } = fixture();
    const cfg = DEFAULT_AI_CONFIG;
    docs.set(`teasers/p1__en__${cfg.promptVersion}`, { text: 'Explore this historic place.' });
    const untouched = vi.fn(() => {
      throw new Error('audio/provider must not be touched');
    });
    const forbidden = <T extends object>() => new Proxy({} as T, { get: untouched });
    const textDeps: TeaserDeps = {
      ...deps,
      config: async () => cfg,
      llm: forbidden(),
      sources: forbidden(),
      authorize: async (uid, poi, access) => {
        await authorizeTextContent(deps, uid, { ...access, poiIds: [poi.id], tile: poi.tile });
      },
    };
    const before = structuredClone([...docs]);
    expect(await getTeaser(textDeps, 'u', { poiId: pois[0]!.id, lang: 'en' })).toEqual({
      text: 'Explore this historic place.',
      cached: true,
    });
    expect(untouched).not.toHaveBeenCalled();
    expect([...docs]).toEqual(before);
  });

  it('generates uncached free text with provider cost accounting but no TTS or user credit consumption', async () => {
    const { deps, docs } = fixture();
    const audioCalled = vi.fn(() => {
      throw new Error('free text must not instantiate audio');
    });
    const audio = <T extends object>() => new Proxy({} as T, { get: audioCalled });
    const llm = new MockLlmProvider();
    vi.spyOn(llm, 'teaser').mockResolvedValue({
      text: 'Hier lässt sich die Umgebung zu Fuß entdecken.',
      usage: { liteInputTokens: 20, liteOutputTokens: 20 },
    });
    const mixedDeps: NarrationDeps = {
      ...deps,
      config: async () => DEFAULT_AI_CONFIG,
      llm,
      sources: new MockNarrationSources(),
      tts: audio(),
      encoder: audio(),
      store: audio(),
      authorize: async (uid, poi, access) => {
        await authorizeTextContent(deps, uid, { ...access, poiIds: [poi.id], tile: poi.tile });
      },
    };
    const wallet = structuredClone(docs.get('users/u/credits/wallet'));
    expect(await getTeaser(mixedDeps, 'u', { poiId: 'p1', lang: 'de' })).toMatchObject({
      text: expect.any(String),
      cached: false,
    });
    expect(audioCalled).not.toHaveBeenCalled();
    expect(docs.get('users/u/credits/wallet')).toEqual(wallet);
    expect([...docs.keys()].some((key) => key.includes('/entitlements/') || key.includes('/tourTime'))).toBe(
      false,
    );
    expect([...docs.keys()].some((key) => key.startsWith('usageDaily/'))).toBe(true);
  });

  it.each(['free', 'reward'])(
    'denies %s audio before provider/cache use and rejects old lease replays',
    async (source) => {
      const { deps, docs, now } = fixture();
      docs.set('users/u/entitlements/old', {
        type: 'tour',
        tourId: 't',
        source,
        grantedAt: now,
        expiresAt: null,
      });
      const untouched = vi.fn(() => {
        throw new Error('audio/provider must not be touched');
      });
      const forbidden = <T extends object>() => new Proxy({} as T, { get: untouched });
      const audioDeps: NarrationDeps = {
        ...deps,
        config: async () => DEFAULT_AI_CONFIG,
        llm: forbidden(),
        tts: forbidden(),
        sources: forbidden(),
        encoder: forbidden(),
        store: forbidden(),
        authorize: async (uid, poi, access, options) => {
          await authorizeContent(deps, uid, {
            ...access,
            poiIds: [poi.id],
            tile: poi.tile,
            download: options?.download,
          });
        },
      };
      const access = { tourId: 't', mode: 'tour' };
      await expect(
        getNarration(audioDeps, 'u', { poiId: 'p1', lang: 'en', lengthTier: 'short', access }),
      ).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(
        getTransition(audioDeps, 'u', { fromPoiId: 'p1', toPoiId: 'p2', lang: 'en', walkMinutes: 2, access }),
      ).rejects.toMatchObject({ code: 'permission-denied' });
      docs.set('users/u/tourTimeSessions/old', {
        mode: 'tour',
        tourId: 't',
        placeId: 'berlin',
        sequence: 1,
        result: { source: 'free', state: 'active' },
      });
      const before = structuredClone([...docs]);
      await expect(
        updateTourTime(deps, 'u', {
          sessionId: 'old',
          sequence: 1,
          mode: 'tour',
          tourId: 't',
          state: 'active',
        }),
      ).rejects.toMatchObject({ details: { reason: 'audio_requires_purchase' } });
      expect(untouched).not.toHaveBeenCalled();
      expect([...docs]).toEqual(before);
    },
  );

  it('preserves online audio and legacy leases for purchase-backed gifts without consuming credits', async () => {
    const { deps, docs, now } = fixture();
    docs.get('tours/t')!.free = true;
    const gift = {
      type: 'tour',
      tourId: 't',
      source: 'invite',
      inviteFrom: 'paid-legacy-owner',
      grantedAt: now,
      expiresAt: null,
    };
    docs.set('users/u/entitlements/tour_t', gift);
    const wallet = structuredClone(docs.get('users/u/credits/wallet'));
    await expect(authorizeContent(deps, 'u', { tourId: 't', poiIds: ['p1'] })).resolves.toEqual({
      reason: 'tour',
    });
    const request = { sessionId: 'gift-session', sequence: 1, mode: 'tour', tourId: 't', state: 'active' };
    const lease = await updateTourTime(deps, 'u', request);
    expect(lease).toMatchObject({ source: 'legacy', state: 'active' });
    expect(await updateTourTime(deps, 'u', request)).toEqual(lease);
    await expect(spendCredit(deps, 'u', { kind: 'tour', tourId: 't' })).rejects.toMatchObject({
      details: { reason: 'already_unlocked' },
    });
    expect(docs.get('users/u/credits/wallet')).toEqual(wallet);
    expect(docs.get('users/u/entitlements/tour_t')).toEqual(gift);
  });

  it('explicit audio upgrade spends only paid credit even for a free tour with old rewards', async () => {
    const { deps, docs } = fixture();
    docs.get('tours/t')!.free = true;
    expect(await spendCredit(deps, 'u', { kind: 'tour', tourId: 't' })).toMatchObject({
      used: 'paid',
      wallet: { balance: 1, rewardBalance: 3 },
    });
    expect(docs.get('users/u/entitlements/tour_t')).toMatchObject({
      source: 'credit',
      timeAllowanceSeconds: 5400,
    });
    await expect(spendCredit(deps, 'u', { kind: 'tour', tourId: 't' })).rejects.toMatchObject({
      details: { reason: 'already_unlocked' },
    });
  });

  it('never turns a rewarded wallet into paid audio', async () => {
    const { deps, docs } = fixture();
    docs.get('users/u/credits/wallet')!.balance = 0;
    const before = structuredClone([...docs]);
    await expect(spendCredit(deps, 'u', { kind: 'tour', tourId: 't' })).rejects.toMatchObject({
      details: { reason: 'insufficient' },
    });
    expect([...docs]).toEqual(before);
  });
});

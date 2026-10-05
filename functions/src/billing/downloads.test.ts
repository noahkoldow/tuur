import { describe, expect, it, vi } from 'vitest';
import { buildPois, DEFAULT_AI_CONFIG, REGION_FIXTURES } from '@tuur/shared';
import type { Firestore } from 'firebase-admin/firestore';
import { authorizeContent, ClaimTourStartSchema } from './entitlements';
import { prepareTourDownload } from './downloads';
import { getNarration, type NarrationDeps } from '../narration/service';
import { getTransition } from '../narration/transition';

function fixture() {
  const now = 1_800_000_000_000;
  const docs = new Map<string, Record<string, unknown>>([
    [
      'users/u/entitlements/sub',
      { type: 'subscription', active: true, productId: 'sub', expiresAt: now + 86400_000, updatedAt: now },
    ],
    [
      'users/u/sessions/abcdefghijklmnopqrst',
      {
        id: 'planned_abcdefghijklmnopqrst',
        kind: 'planned',
        source: 'planned',
        template: 'planned',
        placeId: 'berlin',
        expiresAt: now + 3600_000,
        stops: [{ poiId: 'p1' }, { poiId: 'p2' }],
      },
    ],
    [
      'tours/ready',
      {
        id: 'ready',
        source: 'auto',
        template: 'highlights',
        placeId: 'berlin',
        locked: false,
        free: false,
        stops: [{ poiId: 'p1' }],
      },
    ],
  ]);
  const snapshot = (path: string) => ({
    exists: docs.has(path),
    data: () => docs.get(path),
    get: (key: string) => docs.get(path)?.[key],
  });
  const ref = (path: string, collection: boolean): unknown => ({
    doc: (id: string) => ref(`${path}/${id}`, false),
    collection: (id: string) => ref(`${path}/${id}`, true),
    get: async () =>
      collection
        ? {
            docs: [...docs.keys()]
              .filter(
                (key) => key.startsWith(`${path}/`) && key.slice(path.length + 1).split('/').length === 1,
              )
              .map(snapshot),
          }
        : snapshot(path),
  });
  const db = { collection: (id: string) => ref(id, true) } as unknown as Firestore;
  return { docs, deps: { db, now: () => now }, now };
}

describe('fixed itinerary download authorization', () => {
  it.each(['reward', 'invite', 'free'])(
    'denies new downloads from a %s grant while preserving online access',
    async (source) => {
      const { docs, deps, now } = fixture();
      docs.delete('users/u/entitlements/sub');
      docs.set('users/u/entitlements/tour_ready', {
        type: 'tour',
        tourId: 'ready',
        source,
        grantedAt: now,
        expiresAt: null,
      });
      await expect(
        authorizeContent(deps, 'u', { tourId: 'ready', mode: 'tour', poiIds: ['p1'] }),
      ).resolves.toMatchObject({ reason: 'tour' });
      await expect(prepareTourDownload(deps, 'u', { tourId: 'ready', mode: 'tour' })).rejects.toMatchObject({
        code: 'permission-denied',
        details: { reason: 'download_requires_purchase' },
      });
    },
  );

  it('accepts only the exact paid tour and does not spend credits or write start usage for downloads', async () => {
    const { docs, deps, now } = fixture();
    docs.delete('users/u/entitlements/sub');
    const paid = { type: 'tour', tourId: 'other', source: 'credit', grantedAt: now, expiresAt: null };
    docs.set('users/u/entitlements/paid', paid);
    await expect(prepareTourDownload(deps, 'u', { tourId: 'ready', mode: 'tour' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    paid.tourId = 'ready';
    const before = structuredClone([...docs]);
    await expect(prepareTourDownload(deps, 'u', { tourId: 'ready', mode: 'tour' })).resolves.toEqual({
      tourId: 'ready',
      mode: 'tour',
      grantedAt: now,
      expiresAt: null,
    });
    expect([...docs]).toEqual(before);
  });

  it.each([
    { active: false, expiresAtOffset: 1000 },
    { active: true, expiresAtOffset: 0 },
  ])('rejects inactive or expired Premium: %j', async ({ active, expiresAtOffset }) => {
    const { docs, deps, now } = fixture();
    Object.assign(docs.get('users/u/entitlements/sub')!, { active, expiresAt: now + expiresAtOffset });
    await expect(prepareTourDownload(deps, 'u', { tourId: 'ready', mode: 'tour' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('uses the planned route server-side place for its valid paid 24h session, with no standard-tour access from that session', async () => {
    const { docs, deps, now } = fixture();
    docs.delete('users/u/entitlements/sub');
    const session = {
      type: 'session',
      source: 'credit',
      placeId: 'other',
      grantedAt: now,
      expiresAt: now + 1000,
    };
    docs.set('users/u/entitlements/session', session);
    const request = { tourId: 'planned_abcdefghijklmnopqrst', mode: 'planned', placeId: 'other' };
    await expect(prepareTourDownload(deps, 'u', request)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    session.placeId = 'berlin';
    await expect(prepareTourDownload(deps, 'u', request)).resolves.toMatchObject({ expiresAt: null });
    await expect(prepareTourDownload(deps, 'u', { tourId: 'ready', mode: 'tour' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    session.expiresAt = now;
    await expect(prepareTourDownload(deps, 'u', request)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it.each(['narration', 'transition'])(
    'enforces download rights at the %s endpoint before cache, AI, TTS or storage access',
    async (endpoint) => {
      const { docs, deps, now } = fixture();
      docs.delete('users/u/entitlements/sub');
      docs.set('users/u/entitlements/tour_ready', {
        type: 'tour',
        tourId: 'ready',
        source: 'reward',
        grantedAt: now,
        expiresAt: null,
      });
      docs.get('tours/ready')!['stops'] = [{ poiId: 'p1' }, { poiId: 'p2' }];
      const pois = buildPois(REGION_FIXTURES[0]!.raw, { now }).pois;
      docs.set('pois/p1', { ...pois[0], id: 'p1' });
      docs.set('pois/p2', { ...pois[1], id: 'p2' });
      const provider = vi.fn(() => {
        throw new Error('provider must not be touched');
      });
      const forbidden = <T extends object>(): T => new Proxy({} as T, { get: provider });
      const deniedDeps: NarrationDeps = {
        ...deps,
        config: async () => DEFAULT_AI_CONFIG,
        authorize: async (uid, poi, access, options) => {
          await authorizeContent(deps, uid, { ...access, poiIds: [poi.id], download: options?.download });
        },
        llm: forbidden(),
        tts: forbidden(),
        store: forbidden(),
        encoder: forbidden(),
        sources: forbidden(),
      };
      const request = { lang: 'de', download: true, access: { tourId: 'ready', mode: 'tour' } };
      const collection = vi.spyOn(deps.db, 'collection');
      const operation =
        endpoint === 'narration'
          ? getNarration(deniedDeps, 'u', { ...request, poiId: 'p1', lengthTier: 'short' })
          : getTransition(deniedDeps, 'u', { ...request, fromPoiId: 'p1', toPoiId: 'p2', walkMinutes: 2 });
      await expect(operation).rejects.toMatchObject({
        code: 'permission-denied',
        details: { reason: 'download_requires_purchase' },
      });
      expect(provider).not.toHaveBeenCalled();
      expect(collection.mock.calls.some(([name]) => name === 'narrations')).toBe(false);
      expect([...docs.keys()].some((key) => key.startsWith('narrations/'))).toBe(false);
    },
  );

  it('grants permanent planned and ready-made receipts without requiring or writing a tour start', async () => {
    const { docs, deps, now } = fixture();
    const before = [...docs.keys()];
    expect(
      await prepareTourDownload(deps, 'u', { tourId: 'planned_abcdefghijklmnopqrst', mode: 'planned' }),
    ).toEqual({
      tourId: 'planned_abcdefghijklmnopqrst',
      mode: 'planned',
      grantedAt: now,
      expiresAt: null,
    });
    expect(await prepareTourDownload(deps, 'u', { tourId: 'ready', mode: 'tour' })).toMatchObject({
      mode: 'tour',
      expiresAt: null,
    });
    expect([...docs.keys()]).toEqual(before);
    await expect(
      authorizeContent(deps, 'u', { tourId: 'ready', mode: 'tour', poiIds: ['p1'] }),
    ).rejects.toMatchObject({ details: { reason: 'tour_start_required' } });
  });

  it('denies another owner, expired sessions and places outside the saved plan', async () => {
    const { docs, deps, now } = fixture();
    await expect(
      prepareTourDownload(deps, 'other', { tourId: 'planned_abcdefghijklmnopqrst', mode: 'planned' }),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      authorizeContent(deps, 'u', {
        tourId: 'planned_abcdefghijklmnopqrst',
        mode: 'planned',
        poiIds: ['elsewhere'],
        download: true,
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    docs.get('users/u/sessions/abcdefghijklmnopqrst')!['expiresAt'] = now;
    await expect(
      prepareTourDownload(deps, 'u', { tourId: 'planned_abcdefghijklmnopqrst', mode: 'planned' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects dynamic download API requests before generation or source lookup', async () => {
    const { deps } = fixture();
    for (const mode of ['roam', 'fork'] as const) {
      await expect(prepareTourDownload(deps, 'u', { tourId: 'ready', mode })).rejects.toMatchObject({
        code: 'invalid-argument',
      });
      await expect(
        getNarration({} as NarrationDeps, 'u', {
          poiId: 'p1',
          lang: 'de',
          lengthTier: 'short',
          download: true,
          access: { mode },
        }),
      ).rejects.toMatchObject({ details: { reason: 'download_not_supported' } });
      await expect(
        getTransition({} as NarrationDeps, 'u', {
          fromPoiId: 'p1',
          toPoiId: 'p2',
          walkMinutes: 2,
          lang: 'de',
          download: true,
          access: { mode },
        }),
      ).rejects.toMatchObject({ details: { reason: 'download_not_supported' } });
    }
  });

  it('cannot disguise a dynamic route as mode:tour in a direct content download request', async () => {
    const { docs, deps } = fixture();
    docs.get('tours/ready')!['template'] = 'roam';
    await expect(
      authorizeContent(deps, 'u', { tourId: 'ready', mode: 'tour', poiIds: ['p1'], download: true }),
    ).rejects.toMatchObject({ details: { reason: 'download_not_supported' } });
  });

  it('accepts the real Firestore planned session id while preserving UUID checks on ready-made starts', () => {
    expect(
      ClaimTourStartSchema.safeParse({
        tourId: 'planned_abcdefghijklmnopqrst',
        sessionId: 'abcdefghijklmnopqrst',
        mode: 'planned',
      }).success,
    ).toBe(true);
    expect(
      ClaimTourStartSchema.safeParse({ tourId: 'ready', sessionId: 'abcdefghijklmnopqrst', mode: 'tour' })
        .success,
    ).toBe(false);
  });
});

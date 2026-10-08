import { describe, expect, it } from 'vitest';
import { REGION_FIXTURES, createTourScript, encodeGeohash } from '@tuur/shared';
import { createDemoBackend } from './demoBackend';

async function setup() {
  const backend = createDemoBackend({ latencyMs: 0, enforceAccess: true });
  await backend.auth.signInWithEmail('group@example.test', 'password', true);
  const center = REGION_FIXTURES[0]!.center;
  const tile = encodeGeohash(center.lat, center.lng, 6);
  await backend.ensureArea(tile);
  const list = await backend.getAutoTours(tile, 'de');
  const tour = (await backend.getTour(list.tours.find((candidate) => !candidate.free)!.id))!;
  backend.demo!.grantCredits(1);
  await backend.spendCredit({ kind: 'tour', tourId: tour.id });
  await backend.updateTourTime({
    sessionId: 'host-walk',
    sequence: 0,
    mode: 'tour',
    tourId: tour.id,
    state: 'active',
  });
  const audio = {
    lang: 'de',
    voice: 'classic',
    script: createTourScript({ lang: 'de', tour, instanceId: 'group-script' }),
  };
  const access = { tourId: tour.id, mode: 'tour' as const, sessionId: 'host-walk' };
  return { backend, tour, audio, access };
}

describe('demo shared group recordings', () => {
  it('reuses one host recording and transition despite different requested language, voice and length', async () => {
    const { backend, tour, audio, access } = await setup();
    const { group } = await backend.createGroup({ ...access, audio });
    const groupAccess = { ...access, groupId: group.id };
    const poiId = tour.stops[0]!.poiId;
    const host = await backend.getNarration({ poiId, lang: 'de', lengthTier: 'long', access: groupAccess });
    const repeated = await backend.getNarration({
      poiId,
      lang: 'en',
      voice: 'different',
      lengthTier: 'short',
      access: groupAccess,
    });
    expect(repeated).toEqual({ ...host, cached: true });
    expect(group.audio).toEqual(audio);
    expect(group.sessionId).toBe('host-walk');
    const transition = {
      fromPoiId: poiId,
      toPoiId: tour.stops[1]!.poiId,
      lang: 'de',
      walkMinutes: 2,
      access: groupAccess,
    };
    const shared = await backend.getTransition(transition);
    expect(
      await backend.getTransition({ ...transition, lang: 'en', voice: 'different', walkMinutes: 12 }),
    ).toEqual(shared);
    await backend.updateTourTime({ ...access, sequence: 1, state: 'paused' });
    await expect(
      backend.getNarration({ poiId, lang: 'de', lengthTier: 'long', access: groupAccess }),
    ).rejects.toMatchObject({ reason: 'tour_time_required' });
  });

  it('publishes already heard host audio when inviting mid-tour and revokes it when the group ends', async () => {
    const { backend, tour, audio, access } = await setup();
    const poiId = tour.stops[0]!.poiId;
    const host = await backend.getNarration({
      poiId,
      lang: audio.lang,
      voice: audio.voice,
      lengthTier: 'medium',
      context: { script: audio.script },
      access,
    });
    const { group } = await backend.createGroup({
      ...access,
      audio,
      recordings: [{ kind: 'narration', poiId, key: host.key }],
    });
    const groupAccess = { ...access, groupId: group.id };
    expect(
      await backend.getNarration({ poiId, lang: 'en', lengthTier: 'long', access: groupAccess }),
    ).toEqual({ ...host, cached: true });
    await backend.leaveGroup(group.id);
    await expect(
      backend.getNarration({ poiId, lang: 'de', lengthTier: 'medium', access: groupAccess }),
    ).rejects.toMatchObject({ reason: 'group_ended' });
  });
});

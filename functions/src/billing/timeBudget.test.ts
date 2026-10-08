import { describe, expect, it } from 'vitest';
import {
  CREDIT_TOUR_MINUTES,
  SUBSCRIPTION_TOUR_MINUTES_PER_MONTH,
  type UpdateTourTimeRequest,
} from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { authorizeContent, spendCredit } from './entitlements';
import { prepareTourDownload } from './downloads';
import {
  assertTourTimeAccess,
  bindDownloadRecording,
  readTourTimeTransfer,
  updateTourTime,
} from './timeBudget';

function fixture(productId = 'tuur_sub_monthly') {
  const { db, docs } = memoryFirestore();
  let now = Date.UTC(2026, 9, 7, 12);
  docs.set('tours/t', {
    id: 't',
    placeId: 'berlin',
    source: 'auto',
    template: 'highlights',
    durationMinutes: 90,
    free: false,
    locked: false,
    stops: [{ poiId: 'p1' }],
  });
  docs.set('users/u/sessions/plan', {
    kind: 'planned',
    id: 'planned_plan',
    source: 'planned',
    template: 'planned',
    placeId: 'berlin',
    durationMinutes: 90,
    expiresAt: now + 86400_000,
    stops: [{ poiId: 'p1' }],
  });
  docs.set('places/berlin', { name: 'Berlin' });
  docs.set('places/other', { name: 'Other' });
  docs.set('areas/tile', { placeId: 'berlin' });
  docs.set('users/u/entitlements/sub', {
    type: 'subscription',
    active: true,
    productId,
    expiresAt: null,
    updatedAt: now,
  });
  const deps = { db, now: () => now };
  const request: UpdateTourTimeRequest = {
    sessionId: 's1',
    sequence: 1,
    mode: 'tour',
    tourId: 't',
    state: 'active',
  };
  return {
    db,
    docs,
    deps,
    request,
    advance: (seconds: number) => {
      now += seconds * 1000;
    },
    setNow: (value: number) => {
      now = value;
    },
  };
}

describe('active tour time allowance', () => {
  it.each(['tuur_sub_monthly', 'tuur_sub_yearly'])(
    'grants 500 monthly minutes to %s and charges only active elapsed time',
    async (product) => {
      const { deps, request, advance, docs } = fixture(product);
      expect(await updateTourTime(deps, 'u', request)).toMatchObject({
        remainingSeconds: 500 * 60,
        state: 'active',
      });
      advance(42);
      expect(await updateTourTime(deps, 'u', { ...request, sequence: 2, state: 'paused' })).toMatchObject({
        remainingSeconds: 500 * 60 - 42,
        leaseExpiresAt: null,
      });
      advance(3600);
      expect(await updateTourTime(deps, 'u', { ...request, sequence: 3 })).toMatchObject({
        remainingSeconds: 500 * 60 - 42,
      });
      expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(42);
    },
  );

  it('is idempotent across retries and rejects delayed events instead of reopening an ended tour', async () => {
    const { deps, request, advance, docs } = fixture();
    const start = await updateTourTime(deps, 'u', request);
    advance(20);
    expect(await updateTourTime(deps, 'u', request)).toEqual(start);
    const end = await updateTourTime(deps, 'u', { ...request, sequence: 3, state: 'ended' });
    advance(60);
    expect(await updateTourTime(deps, 'u', { ...request, sequence: 2 })).toEqual(end);
    await expect(updateTourTime(deps, 'u', { ...request, sequence: 4 })).rejects.toMatchObject({
      details: { reason: 'tour_session_ended' },
    });
    expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(20);
  });

  it('serializes two devices and charges no more than the last lease after disconnection', async () => {
    const { deps, request, advance, docs } = fixture();
    const results = await Promise.allSettled([
      updateTourTime(deps, 'u', request),
      updateTourTime(deps, 'u', { ...request, sessionId: 's2' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    advance(3600);
    await expect(
      assertTourTimeAccess(deps, 'u', { mode: 'tour', tourId: 't', sessionId: 's1' }),
    ).rejects.toMatchObject({ details: { reason: 'tour_time_required' } });
    await updateTourTime(deps, 'u', { ...request, sequence: 2, state: 'paused' });
    expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(90);
    expect(await updateTourTime(deps, 'u', { ...request, sessionId: 's2', sequence: 2 })).toMatchObject({
      remainingSeconds: 29910,
    });
  });

  it.each(['tour', 'planned', 'fork', 'roam'] as const)(
    'requires the matching lease for %s content',
    async (mode) => {
      const { deps, request } = fixture();
      const context =
        mode === 'tour'
          ? { mode, tourId: 't' }
          : mode === 'planned'
            ? { mode, tourId: 'planned_plan' }
            : { mode, placeId: 'berlin', tile: 'tile' };
      await expect(authorizeContent(deps, 'u', { ...context, poiIds: ['p1'] })).rejects.toMatchObject({
        details: { reason: 'tour_time_required' },
      });
      await updateTourTime(deps, 'u', { ...request, tourId: undefined, ...context });
      await expect(
        authorizeContent(deps, 'u', { ...context, poiIds: ['p1'], sessionId: request.sessionId }),
      ).resolves.toMatchObject({ reason: 'subscription' });
      await expect(
        authorizeContent(deps, 'u', { ...context, poiIds: ['p1'], sessionId: 'another' }),
      ).rejects.toMatchObject({ details: { reason: 'tour_time_required' } });
    },
  );

  it('allows a planned walk to continue in Explore at the same place against the original lease', async () => {
    const { deps, request } = fixture();
    await updateTourTime(deps, 'u', { ...request, mode: 'planned', tourId: 'planned_plan' });
    await expect(
      authorizeContent(deps, 'u', { mode: 'roam', tile: 'tile', poiIds: ['p1'], sessionId: 's1' }),
    ).resolves.toMatchObject({ reason: 'subscription' });
  });

  it('does not accept a forged dynamic place or bind an existing session to another activity', async () => {
    const { deps, request } = fixture();
    await expect(
      updateTourTime(deps, 'u', {
        ...request,
        mode: 'roam',
        tourId: undefined,
        tile: 'tile',
        placeId: 'other',
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await updateTourTime(deps, 'u', request);
    await expect(
      updateTourTime(deps, 'u', { ...request, sequence: 2, mode: 'planned', tourId: 'planned_plan' }),
    ).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('commits the last seconds and pauses exactly at the budget limit', async () => {
    const { deps, request, docs, advance } = fixture();
    docs.set('users/u/tourTime/budget', { month: '2026-10', usedSeconds: 29980, active: null });
    const start = await updateTourTime(deps, 'u', request);
    expect(start.leaseExpiresAt).toBe(deps.now() + 20000);
    advance(21);
    expect(await updateTourTime(deps, 'u', { ...request, sequence: 2 })).toMatchObject({
      state: 'paused',
      remainingSeconds: 0,
    });
    expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(500 * 60);
    await expect(
      authorizeContent(deps, 'u', { mode: 'tour', tourId: 't', poiIds: ['p1'], planning: true }),
    ).rejects.toMatchObject({ details: { reason: 'tour_time_exhausted' } });
  });

  it('keeps a running lease across renewal and charges only its new-month portion to the new allowance', async () => {
    const { deps, request, setNow, advance, docs } = fixture('tuur_sub_yearly');
    setNow(Date.UTC(2026, 9, 31, 23, 59, 30));
    docs.set('users/u/tourTime/budget', { month: '2026-10', usedSeconds: 29940, active: null });
    const start = await updateTourTime(deps, 'u', request);
    expect(start.leaseExpiresAt).toBe(Date.UTC(2026, 10, 1, 0, 1));
    advance(45);
    expect(await updateTourTime(deps, 'u', { ...request, sequence: 2 })).toMatchObject({
      remainingSeconds: SUBSCRIPTION_TOUR_MINUTES_PER_MONTH * 60 - 15,
    });
    expect(docs.get('users/u/tourTime/budget')).toMatchObject({
      month: '2026-11',
      usedSeconds: 15,
      usageByAccount: { u: 15 },
    });
  });

  it('does not bridge insufficient old-month minutes, and caps crossing leases at subscription expiry', async () => {
    const { deps, request, setNow, advance, docs } = fixture();
    setNow(Date.UTC(2026, 9, 31, 23, 59, 30));
    docs.set('users/u/tourTime/budget', { month: '2026-10', usedSeconds: 29990, active: null });
    expect((await updateTourTime(deps, 'u', request)).leaseExpiresAt).toBe(deps.now() + 10000);
    advance(11);
    expect(await updateTourTime(deps, 'u', { ...request, sequence: 2 })).toMatchObject({
      remainingSeconds: 0,
      state: 'paused',
      leaseExpiresAt: null,
    });
    docs.set('users/u/tourTime/budget', { month: '2026-10', usedSeconds: 29900, active: null });
    docs.get('users/u/entitlements/sub')!.expiresAt = Date.UTC(2026, 10, 1, 0, 0, 5);
    expect((await updateTourTime(deps, 'u', { ...request, sequence: 3 })).leaseExpiresAt).toBe(
      Date.UTC(2026, 10, 1, 0, 0, 5),
    );
  });

  it('does not bill the new month for time after a disconnected crossing lease has expired', async () => {
    const { deps, request, setNow, advance, docs } = fixture();
    setNow(Date.UTC(2026, 9, 31, 23, 59, 30));
    await updateTourTime(deps, 'u', request);
    advance(600);
    expect(await updateTourTime(deps, 'u', { ...request, sequence: 2, state: 'paused' })).toMatchObject({
      remainingSeconds: 29940,
      state: 'paused',
    });
    expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(60);
  });

  it('keeps a user pause paused when the monthly allowance refreshes', async () => {
    const { deps, request, setNow, advance, docs } = fixture();
    setNow(Date.UTC(2026, 9, 31, 23, 59, 30));
    await updateTourTime(deps, 'u', request);
    advance(5);
    await updateTourTime(deps, 'u', { ...request, sequence: 2, state: 'paused' });
    advance(60);
    expect(await updateTourTime(deps, 'u', { ...request, sequence: 3, state: 'paused' })).toMatchObject({
      state: 'paused',
      remainingSeconds: 30000,
      leaseExpiresAt: null,
    });
    expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(0);
  });

  it('gives newly spent credits 90 active minutes and permits another credit only when consumed', async () => {
    const { deps, request, docs, advance } = fixture();
    docs.delete('users/u/entitlements/sub');
    docs.set('users/u/credits/wallet', { balance: 2, rewardBalance: 2 });
    await spendCredit(deps, 'u', { kind: 'tour', tourId: 't' });
    expect(docs.get('users/u/entitlements/tour_t')).toMatchObject({
      timeAllowanceSeconds: CREDIT_TOUR_MINUTES * 60,
      timeRemainingSeconds: 5400,
    });
    await expect(spendCredit(deps, 'u', { kind: 'tour', tourId: 't' })).rejects.toMatchObject({
      details: { reason: 'already_unlocked' },
    });
    docs.get('users/u/entitlements/tour_t')!.timeRemainingSeconds = 10;
    expect(await updateTourTime(deps, 'u', request)).toMatchObject({
      source: 'credit',
      remainingSeconds: 10,
    });
    advance(11);
    expect(await updateTourTime(deps, 'u', { ...request, sequence: 2 })).toMatchObject({
      remainingSeconds: 0,
      state: 'paused',
    });
    await spendCredit(deps, 'u', { kind: 'tour', tourId: 't' });
    expect(docs.get('users/u/entitlements/tour_t')?.timeRemainingSeconds).toBe(5400);
    expect(docs.get('users/u/credits/wallet')?.rewardBalance).toBe(2);
  });

  it('retains legacy permanent purchases and 24h sessions with no time debit', async () => {
    const { deps, request, docs, advance } = fixture();
    docs.delete('users/u/entitlements/sub');
    docs.set('users/u/entitlements/old', {
      type: 'tour',
      tourId: 't',
      source: 'credit',
      expiresAt: null,
      grantedAt: 0,
    });
    expect(await updateTourTime(deps, 'u', request)).toMatchObject({
      source: 'legacy',
      remainingSeconds: null,
    });
    advance(1000);
    await updateTourTime(deps, 'u', { ...request, sequence: 2, state: 'ended' });
    await expect(authorizeContent(deps, 'u', { tourId: 't', poiIds: ['p1'] })).resolves.toMatchObject({
      reason: 'tour',
    });
    await expect(prepareTourDownload(deps, 'u', { mode: 'tour', tourId: 't' })).resolves.toMatchObject({
      expiresAt: null,
    });
    expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(0);
    docs.set('users/u/entitlements/old-session', {
      type: 'session',
      placeId: 'berlin',
      source: 'credit',
      grantedAt: deps.now(),
      expiresAt: deps.now() + 86400_000,
    });
    await expect(
      authorizeContent(deps, 'u', { mode: 'roam', tile: 'tile', poiIds: ['p1'] }),
    ).resolves.toMatchObject({ reason: 'session' });
    advance(86401);
    await expect(
      authorizeContent(deps, 'u', { mode: 'roam', tile: 'tile', poiIds: ['p1'] }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('keeps a new 90-minute place credit across long pauses and meters dynamic modes', async () => {
    const { deps, docs, advance } = fixture();
    docs.delete('users/u/entitlements/sub');
    docs.set('users/u/credits/wallet', { balance: 1, rewardBalance: 0 });
    await spendCredit(deps, 'u', { kind: 'session', placeId: 'berlin' });
    expect(docs.get('users/u/entitlements/session_berlin')).toMatchObject({
      timeAllowanceSeconds: 5400,
      timeRemainingSeconds: 5400,
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
    const request = { mode: 'fork', placeId: 'berlin', sessionId: 'dynamic', sequence: 1, state: 'active' };
    await updateTourTime(deps, 'u', request);
    advance(60);
    await updateTourTime(deps, 'u', { ...request, sequence: 2, state: 'paused' });
    advance(7 * 86400);
    expect(await updateTourTime(deps, 'u', { ...request, sequence: 3 })).toMatchObject({
      source: 'credit',
      remainingSeconds: 5340,
    });
  });

  it('reserves download minutes once per script, denies unprepared generation and does not allow unlimited fresh scripts', async () => {
    const { deps, docs } = fixture();
    const download = { mode: 'tour', tourId: 't', scriptInstanceId: 'offline1' };
    await expect(prepareTourDownload(deps, 'u', { mode: 'tour', tourId: 't' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await prepareTourDownload(deps, 'u', download);
    await prepareTourDownload(deps, 'u', download);
    expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(5400);
    await expect(
      authorizeContent(deps, 'u', { mode: 'tour', tourId: 't', download: true, poiIds: ['p1'] }),
    ).rejects.toMatchObject({ details: { reason: 'download_time_required' } });
    await expect(
      authorizeContent(deps, 'u', {
        mode: 'tour',
        tourId: 't',
        download: true,
        downloadId: 'offline1',
        poiIds: ['p1'],
      }),
    ).resolves.toMatchObject({ reason: 'subscription' });
    for (let i = 2; i <= 5; i++)
      await prepareTourDownload(deps, 'u', { ...download, scriptInstanceId: `offline${i}` });
    await expect(
      prepareTourDownload(deps, 'u', { ...download, scriptInstanceId: 'offline6' }),
    ).rejects.toMatchObject({ details: { reason: 'tour_time_exhausted' } });
    expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(27000);
  });

  it('merges consumption on repeated subscription transfers without resetting or double counting', async () => {
    const { db, docs, deps } = fixture();
    docs.set('users/u/tourTime/budget', {
      month: '2026-10',
      usedSeconds: 300,
      usageByAccount: { u: 300 },
      active: null,
    });
    docs.set('users/v/tourTime/budget', {
      month: '2026-10',
      usedSeconds: 60,
      usageByAccount: { v: 60 },
      active: null,
    });
    const transfer = () =>
      db.runTransaction(async (tx) => {
        (await readTourTimeTransfer(tx, db, ['u', 'v'], deps.now()))();
      });
    await transfer();
    await transfer();
    expect(docs.get('users/u/tourTime/budget')?.usedSeconds).toBe(360);
    expect(docs.get('users/v/tourTime/budget')?.usedSeconds).toBe(360);
  });

  it('pins each prepaid recording profile and permits only the reserved adjacent transitions', async () => {
    const { deps, docs } = fixture();
    docs.get('tours/t')!.stops = [{ poiId: 'p1' }, { poiId: 'p2' }, { poiId: 'p3' }];
    await prepareTourDownload(deps, 'u', { mode: 'tour', tourId: 't', scriptInstanceId: 'bound' });
    const request = {
      downloadId: 'bound',
      slot: { poiId: 'p1', lengthTier: 'short' },
      identity: 'fixed-context-and-voice',
    };
    await bindDownloadRecording(deps, 'u', request);
    await bindDownloadRecording(deps, 'u', request);
    await expect(
      bindDownloadRecording(deps, 'u', { ...request, identity: 'new-voice-or-story' }),
    ).rejects.toMatchObject({ details: { reason: 'download_recording_mismatch' } });
    await expect(
      bindDownloadRecording(deps, 'u', { ...request, slot: { poiId: 'p1', lengthTier: 'long' } }),
    ).resolves.toBeUndefined();
    await expect(
      bindDownloadRecording(deps, 'u', { ...request, slot: { poiId: 'p2', fromPoiId: 'p1' } }),
    ).resolves.toBeUndefined();
    await expect(
      bindDownloadRecording(deps, 'u', { ...request, slot: { poiId: 'p3', fromPoiId: 'p1' } }),
    ).rejects.toMatchObject({ details: { reason: 'download_recording_mismatch' } });
  });
});

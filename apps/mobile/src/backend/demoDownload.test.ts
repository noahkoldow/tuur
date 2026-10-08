import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REGION_FIXTURES,
  SESSION_DURATION_MS,
  createTourScript,
  encodeGeohash,
  type Tour,
} from '@tuur/shared';
import { createDemoBackend } from './demoBackend';
import type { Backend, EntitlementState } from './types';

vi.mock('./previewRouting', () => ({ previewWalkingPath: async () => undefined }));
afterEach(() => vi.restoreAllMocks());

async function setup() {
  // The UI-preview setting deliberately disables ordinary playback gates, never download billing.
  const backend = createDemoBackend({ latencyMs: 0, enforceAccess: false });
  await backend.auth.signInWithEmail('download@example.com', 'password', true);
  const center = REGION_FIXTURES[0]!.center;
  const tile = encodeGeohash(center.lat, center.lng, 6);
  await backend.ensureArea(tile);
  const generated = await backend.getAutoTours(tile, 'de');
  const tours = (await Promise.all(generated.tours.map((t) => backend.getTour(t.id)))) as Tour[];
  const paid = tours.find((t) => !t.free && t.durationMinutes <= 90)!;
  const free = tours.find((t) => t.free)!;
  expect(paid).toBeDefined();
  expect(free).toBeDefined();
  let state: EntitlementState = { entitlements: [], wallet: { balance: 0, rewardBalance: 0 } };
  backend.watchEntitlements((next) => (state = next));
  return { backend, paid, free, state: () => state };
}

const narration = (backend: Backend, tour: Tour, download = true) =>
  backend.getNarration({
    poiId: tour.stops[0]!.poiId,
    lang: 'de',
    lengthTier: 'short',
    download,
    context: { script: createTourScript({ tour, lang: 'de', instanceId: 'test-download' }) },
    access: {
      tourId: tour.id,
      mode: tour.source === 'planned' ? 'planned' : 'tour',
      downloadId: 'test-download',
    },
  });
const transition = (backend: Backend, tour: Tour) =>
  backend.getTransition({
    fromPoiId: tour.stops[0]!.poiId,
    toPoiId: tour.stops[1]!.poiId,
    lang: 'de',
    walkMinutes: 2,
    download: true,
    scriptInstanceId: 'test-download',
    access: {
      tourId: tour.id,
      mode: tour.source === 'planned' ? 'planned' : 'tour',
      downloadId: 'test-download',
    },
  });
async function expectDownloadLocked(backend: Backend, tour: Tour) {
  const mode = tour.source === 'planned' ? 'planned' : 'tour';
  for (const call of [
    () => backend.prepareTourDownload(tour.id, mode, 'test-download'),
    () => narration(backend, tour),
    () => transition(backend, tour),
  ])
    await expect(call()).rejects.toMatchObject({ code: 'locked', reason: 'download_requires_purchase' });
}

describe('demo download billing parity', () => {
  it('does not spend again for a purchased legacy gift unless a download upgrade is explicit', async () => {
    const { backend, paid, state } = await setup();
    backend.demo!.grantCredits(2);
    await backend.spendCredit({ kind: 'tour', tourId: paid.id });
    const legacy = state().entitlements.find((grant) => grant.type === 'tour')!;
    // Model an older server-written purchase from before minute budgets.
    if (legacy.type !== 'tour') throw new Error('Missing tour grant');
    delete legacy.timeAllowanceSeconds;
    delete legacy.timeRemainingSeconds;
    const invitation = await backend.createInvite(paid.id);
    legacy.tourId = 'other-legacy-tour';
    await backend.redeemInvite(invitation.token);
    await expect(backend.spendCredit({ kind: 'tour', tourId: paid.id })).rejects.toMatchObject({
      reason: 'already_unlocked',
    });
    expect(state().wallet.balance).toBe(1);
    await expect(
      backend.spendCredit({ kind: 'tour', tourId: paid.id, paidOnly: true }),
    ).resolves.toMatchObject({ used: 'paid' });
  });
  it('checks preparation and direct audio downloads even with preview gates off and unused paid credits', async () => {
    const { backend, paid } = await setup();
    backend.demo!.grantCredits(1);
    await expect(narration(backend, paid, false)).resolves.toBeTruthy();
    await expectDownloadLocked(backend, paid);
  });

  it('requires purchased credits despite a reward balance and never charges a paid unlock twice', async () => {
    const { backend, paid, state } = await setup();
    backend.demo!.grantRewardCredit();
    await expect(backend.spendCredit({ kind: 'tour', tourId: paid.id })).rejects.toMatchObject({
      code: 'insufficient_credit',
    });
    await expectDownloadLocked(backend, paid);
    backend.demo!.grantCredits(2);
    expect(await backend.spendCredit({ kind: 'tour', tourId: paid.id })).toMatchObject({
      used: 'paid',
      wallet: { balance: 1, rewardBalance: 1 },
    });
    await expect(backend.prepareTourDownload(paid.id, 'tour', 'test-download')).resolves.toMatchObject({
      expiresAt: null,
    });
    await expect(narration(backend, paid)).resolves.toBeTruthy();
    await expect(transition(backend, paid)).resolves.toBeTruthy();
    await expect(
      backend.spendCredit({ kind: 'tour', tourId: paid.id, paidOnly: true }),
    ).rejects.toMatchObject({
      reason: 'already_unlocked',
    });
    expect(state().wallet).toMatchObject({ balance: 1, rewardBalance: 1 });
  });

  it('does not spend a reward balance when a paid-only purchase lacks purchased credit', async () => {
    const { backend, paid, state } = await setup();
    backend.demo!.grantRewardCredit();
    await expect(
      backend.spendCredit({ kind: 'tour', tourId: paid.id, paidOnly: true }),
    ).rejects.toMatchObject({
      code: 'insufficient_credit',
    });
    expect(state().wallet).toEqual({ balance: 0, rewardBalance: 1 });
    expect(state().entitlements).toEqual([]);
  });

  it('keeps a free ad unlock online-only until an explicit paid purchase, preserving its city claim', async () => {
    const { backend, free, paid } = await setup();
    await backend.auth.confirmPhoneVerification(
      await backend.auth.requestPhoneVerification('+12025550123'),
      '000000',
    );
    await backend.createRewardNonce({ tourId: free.id });
    await expectDownloadLocked(backend, free);
    backend.demo!.grantCredits(1);
    await backend.spendCredit({ kind: 'tour', tourId: free.id, paidOnly: true });
    await expect(backend.prepareTourDownload(free.id, 'tour', 'test-download')).resolves.toMatchObject({
      expiresAt: null,
    });
    await expectDownloadLocked(backend, paid);
    await expect(backend.createRewardNonce({ tourId: free.id })).rejects.toMatchObject({ code: 'locked' });
  });

  it('requires active Premium for new downloads while retaining the permanent receipt already issued', async () => {
    const { backend, paid } = await setup();
    backend.demo!.grantSubscription();
    const receipt = await backend.prepareTourDownload(paid.id, 'tour', 'test-download');
    await expect(narration(backend, paid)).resolves.toBeTruthy();
    await expect(transition(backend, paid)).resolves.toBeTruthy();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 86400_000);
    await expectDownloadLocked(backend, paid);
    expect(receipt.expiresAt).toBeNull();
  });

  it('binds a planned download to its saved route and paid session city, and refuses expired online plans', async () => {
    const { backend, paid } = await setup();
    const { tour } = await backend.composePlannedRoute({
      stops: paid.stops.slice(0, 2).map((stop) => stop.poiId),
      budgetMinutes: 480,
      profile: 'foot-walking',
      lang: 'de',
      roundTrip: false,
      interests: [],
    });
    backend.demo!.grantCredits(2);
    await backend.spendCredit({ kind: 'session', placeId: 'another-city' });
    await expectDownloadLocked(backend, tour);
    await backend.spendCredit({ kind: 'session', placeId: tour.placeId });
    await expect(backend.prepareTourDownload(tour.id, 'planned', 'test-download')).resolves.toMatchObject({
      expiresAt: null,
    });
    await expect(narration(backend, tour)).resolves.toBeTruthy();
    await expect(transition(backend, tour)).resolves.toBeTruthy();
    await expect(backend.prepareTourDownload('planned_unknown', 'planned')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(backend.prepareTourDownload(tour.id, 'tour')).rejects.toMatchObject({ code: 'not_found' });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + SESSION_DURATION_MS + 1);
    for (const call of [
      () => backend.prepareTourDownload(tour.id, 'planned', 'test-download'),
      () => narration(backend, tour),
      () => transition(backend, tour),
    ])
      await expect(call()).rejects.toMatchObject({ code: 'locked' });
  });

  it('does not serve unrelated stops or dynamic downloads under a paid tour grant', async () => {
    const { backend, paid } = await setup();
    backend.demo!.grantCredits(1);
    await backend.spendCredit({ kind: 'tour', tourId: paid.id, paidOnly: true });
    for (const access of [
      { tourId: paid.id, mode: 'tour' as const },
      { tourId: paid.id, mode: 'roam' as const },
    ])
      await expect(
        backend.getNarration({ poiId: 'unrelated', lang: 'de', lengthTier: 'short', download: true, access }),
      ).rejects.toMatchObject({ code: 'locked' });
  });
});

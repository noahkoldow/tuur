import { describe, expect, it } from 'vitest';
import { REGION_FIXTURES, encodeGeohash, type Entitlement } from '@tuur/shared';
import { SimulatedAudioEngine } from '../audio/simulatedEngine';
import { createDemoBackend } from '../backend/demoBackend';
import { BackendError, type Backend, type EntitlementState } from '../backend/types';
import { GuideRuntime } from '../guide/runtime';
import { FakeClock } from '../testing/fakeClock';
import { createDemoAds } from '../ads/demoAds';
import { createDemoBilling } from './demoBilling';
import { canStartTour, canUseSession, subscribed } from './access';

const berlin = REGION_FIXTURES[0]!;

async function setup() {
  const backend = createDemoBackend({ latencyMs: 0, enforceAccess: true });
  await backend.auth.signInWithEmail('test@example.com', 'password', true);
  const tile = encodeGeohash(berlin.center.lat, berlin.center.lng, 6);
  await backend.ensureArea(tile);
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 5));
    let ready = false;
    backend.watchArea(tile, (a) => (ready = a?.status === 'ready' || a?.status === 'low_content'))();
    if (ready) break;
  }
  const res = await backend.getAutoTours(tile, 'de');
  const tours = (await Promise.all(res.tours.map((t) => backend.getTour(t.id)))).filter((t) => t !== null);
  const free = tours.find((t) => t.free)!;
  const paid = tours.find((t) => !t.free)!;
  let state: EntitlementState = { entitlements: [], wallet: { balance: 0, rewardBalance: 0 } };
  backend.watchEntitlements((s) => (state = s));
  return { backend, free, paid, state: () => state, placeId: free.placeId };
}

const narration = (backend: Backend, tourId: string, poiId: string) =>
  backend.getNarration({
    poiId,
    lang: 'de',
    lengthTier: 'short',
    access: { tourId, mode: 'tour', sessionId: 'billing-test' },
  });

describe('gating and unlocking (demo backend mirrors the server rules)', () => {
  it('keeps the annual demo purchase annual while granting 500 minutes per month', async () => {
    const { backend, paid, state } = await setup();
    const now = Date.now();
    await createDemoBilling(backend).purchase('tuur_sub_yearly');
    expect(state().entitlements.find((e) => e.type === 'subscription')).toMatchObject({
      productId: 'tuur_sub_yearly',
      active: true,
    });
    expect(state().entitlements.find((e) => e.type === 'subscription')!.expiresAt).toBeGreaterThan(
      now + 364 * 86400_000,
    );
    expect(
      await backend.updateTourTime({
        sessionId: 'annual',
        sequence: 0,
        state: 'active',
        mode: 'tour',
        tourId: paid.id,
      }),
    ).toMatchObject({ source: 'subscription', remainingSeconds: 30_000 });
  });
  it('keeps audio paid even for free tours and unlocks it with a credit', async () => {
    const { backend, free, paid, state } = await setup();
    // the free tour of a city is claimed once (verified phone + rewarded ad, server rule since the release work)
    await expect(narration(backend, free.id, free.stops[0]!.poiId)).rejects.toMatchObject({ code: 'locked' });
    await backend.auth.confirmPhoneVerification(
      await backend.auth.requestPhoneVerification('+491701234567'),
      '000000',
    );
    await backend.createRewardNonce({ tourId: free.id });
    await expect(narration(backend, free.id, free.stops[0]!.poiId)).rejects.toMatchObject({ code: 'locked' });
    await expect(backend.getTeaser({ poiId: free.stops[0]!.poiId, lang: 'de' })).resolves.toBeTruthy();
    const err = await narration(backend, paid.id, paid.stops[0]!.poiId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendError);
    expect((err as BackendError).code).toBe('locked');
    expect(canStartTour(state(), paid.id, paid.free)).toBe(false);

    await expect(backend.spendCredit({ kind: 'tour', tourId: paid.id })).rejects.toMatchObject({
      code: 'insufficient_credit',
    });
    await createDemoBilling(backend).purchase('tuur_credit_1');
    expect(state().wallet.balance).toBe(1);
    await backend.spendCredit({ kind: 'tour', tourId: paid.id });
    expect(state().wallet.balance).toBe(0);
    expect(canStartTour(state(), paid.id, paid.free)).toBe(true);
    await backend.updateTourTime({
      sessionId: 'billing-test',
      sequence: 0,
      state: 'active',
      mode: 'tour',
      tourId: paid.id,
    });
    await expect(narration(backend, paid.id, paid.stops[0]!.poiId)).resolves.toBeTruthy();
  });

  it('preserves reward balances and requires bought credits for all audio', async () => {
    const { backend, paid, state, placeId } = await setup();
    await createDemoAds(backend).showRewarded({ userId: 'u', nonce: 'n' });
    expect(state().wallet.rewardBalance).toBe(1);
    await expect(backend.spendCredit({ kind: 'session', placeId })).rejects.toMatchObject({
      code: 'insufficient_credit',
    });
    await expect(backend.spendCredit({ kind: 'tour', tourId: paid.id })).rejects.toMatchObject({
      code: 'insufficient_credit',
    });
    await createDemoBilling(backend).purchase('tuur_credit_1');
    await backend.spendCredit({ kind: 'tour', tourId: paid.id });
    expect(state().wallet.rewardBalance).toBe(1);
    expect(state().entitlements.find((e) => e.type === 'tour')).toMatchObject({ source: 'credit' });
  });

  it('dynamic modes need a session or a subscription; a subscription unlocks everything', async () => {
    const { backend, paid, state, placeId } = await setup();
    const req = { poiId: paid.stops[0]!.poiId, lang: 'de', lengthTier: 'short' as const };
    await expect(backend.getNarration({ ...req, access: { mode: 'roam' } })).rejects.toMatchObject({
      code: 'locked',
    });
    expect(canUseSession(state(), 'roam', placeId)).toBe(false);
    const billing = createDemoBilling(backend);
    await billing.purchase('tuur_credit_1');
    await backend.spendCredit({ kind: 'session', placeId });
    expect(canUseSession(state(), 'roam', placeId)).toBe(true);
    await backend.updateTourTime({
      sessionId: 'billing-roam',
      sequence: 0,
      state: 'active',
      mode: 'roam',
      placeId,
    });
    await expect(
      backend.getNarration({ ...req, access: { mode: 'roam', sessionId: 'billing-roam' } }),
    ).resolves.toBeTruthy();
    // a session does not unlock a paid standard tour
    expect(canStartTour(state(), paid.id, false)).toBe(false);

    await billing.purchase('tuur_sub_monthly');
    expect(subscribed(state())).toBe(true);
    expect(canStartTour(state(), paid.id, false)).toBe(true);
  });

  it('expired sessions and tours without context are locked', () => {
    const now = 1_000_000;
    const expired: Entitlement[] = [
      { type: 'session', placeId: 'p', source: 'credit', grantedAt: 0, expiresAt: now - 1 },
    ];
    expect(canUseSession({ entitlements: expired }, 'fork', 'p', now)).toBe(false);
    expect(canUseSession({ entitlements: expired }, 'fork', undefined, now)).toBe(false);
  });
});

describe('invites', () => {
  it('uses live groups for new metered purchases instead of gifting permanent copies', async () => {
    const { backend, paid, state } = await setup();
    await expect(backend.createInvite(paid.id)).rejects.toMatchObject({ reason: 'not_purchased' });
    await createDemoBilling(backend).purchase('tuur_credit_1');
    await backend.spendCredit({ kind: 'tour', tourId: paid.id });
    await expect(backend.createInvite(paid.id)).rejects.toMatchObject({ reason: 'not_purchased' });
    expect(state().entitlements.find((e) => e.type === 'tour')).toMatchObject({ timeRemainingSeconds: 5400 });
  });
});

describe('GuideRuntime with a locked tour', () => {
  it('shows the locked notice and never plays anything', async () => {
    const { backend, paid } = await setup();
    const clock = new FakeClock();
    const audio = new SimulatedAudioEngine(clock);
    const runtime = new GuideRuntime({
      backend,
      audio,
      lang: 'de',
      clock,
      access: { tourId: paid.id, mode: 'tour' },
    });
    const first = paid.stops[0]!;
    const { SimulatedLocationSource } = await import('../location/simulated');
    await runtime.start(
      paid.stops.map((s) => ({ id: s.poiId, name: s.name, location: s.location })),
      new SimulatedLocationSource([first.location, first.location], { clock }),
    );
    for (let i = 0; i < 30; i++) await clock.advance(1000);
    expect(runtime.getSnapshot().notice).toBe('locked');
    expect(runtime.getSnapshot().narration).toBeUndefined();
    await runtime.dispose();
  });
});

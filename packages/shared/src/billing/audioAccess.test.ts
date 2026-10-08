import { describe, expect, it } from 'vitest';
import { decideAudioAccess, type Entitlement } from './entitlements';

const now = 1_800_000_000_000;
const tour = (source: 'credit' | 'reward' | 'invite' | 'free'): Entitlement => ({
  type: 'tour',
  tourId: 't',
  source,
  placeId: 'berlin',
  grantedAt: now,
  expiresAt: null,
});

describe('paid audio access', () => {
  it.each(['reward', 'free'] as const)('retains but never authorizes an old %s grant', (source) => {
    const grants = [tour(source)];
    const before = structuredClone(grants);
    for (const tourFree of [false, true])
      expect(decideAudioAccess(grants, { tourId: 't', tourFree, placeId: 'berlin' }, now).allowed).toBe(
        false,
      );
    expect(grants).toEqual(before);
  });

  it.each(['credit', 'invite'] as const)(
    'preserves legacy %s rights, including tours marked free',
    (source) => {
      expect(decideAudioAccess([tour(source)], { tourId: 't', tourFree: true }, now)).toEqual({
        allowed: true,
        reason: 'tour',
      });
      expect(decideAudioAccess([tour(source)], { tourId: 'another' }, now).allowed).toBe(false);
      expect(decideAudioAccess([{ ...tour(source), expiresAt: now }], { tourId: 't' }, now).allowed).toBe(
        false,
      );
    },
  );

  it('does not introduce audio rights for metered gifts', () => {
    expect(
      decideAudioAccess(
        [{ ...tour('invite'), timeAllowanceSeconds: 5400, timeRemainingSeconds: 5400 } as Entitlement],
        { tourId: 't' },
        now,
      ).allowed,
    ).toBe(false);
  });

  it('rejects expired or exhausted paid tour minutes', () => {
    expect(decideAudioAccess([{ ...tour('credit'), expiresAt: now }], { tourId: 't' }, now).allowed).toBe(
      false,
    );
    expect(
      decideAudioAccess(
        [{ ...tour('credit'), timeAllowanceSeconds: 5400, timeRemainingSeconds: 0 } as Entitlement],
        { tourId: 't' },
        now,
      ).allowed,
    ).toBe(false);
  });

  it('allows valid Premium and a paid credit for the matching dynamic place', () => {
    const sub: Entitlement = {
      type: 'subscription',
      active: true,
      productId: 'premium',
      expiresAt: now + 1,
      willRenew: false,
      updatedAt: now,
    };
    expect(decideAudioAccess([sub], { mode: 'roam', placeId: 'berlin' }, now).allowed).toBe(true);
    const session: Entitlement = {
      type: 'session',
      source: 'credit',
      placeId: 'berlin',
      expiresAt: now + 1,
      grantedAt: now,
    };
    for (const mode of ['planned', 'roam', 'fork'] as const) {
      expect(decideAudioAccess([session], { mode, placeId: 'berlin' }, now).allowed).toBe(true);
      expect(decideAudioAccess([session], { mode, placeId: 'elsewhere' }, now).allowed).toBe(false);
    }
  });
});

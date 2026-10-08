import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Entitlement } from '@tuur/shared';
import { paywallContext } from './paywall-context';

const previewConfig = vi.hoisted(() => ({ paywall: true }));
vi.mock('../config', () => ({ config: previewConfig }));
afterEach(() => {
  previewConfig.paywall = true;
});

const empty = { entitlements: [] };
const subscriber: { entitlements: Entitlement[] } = {
  entitlements: [
    {
      type: 'subscription',
      active: true,
      productId: 'tuur_sub_monthly',
      willRenew: true,
      updatedAt: 1,
      expiresAt: null,
    },
  ],
};

describe('pricing overview and contextual paywalls', () => {
  it('keeps the price overview visible in the demo and after a demo subscription', () => {
    previewConfig.paywall = false;
    expect(paywallContext(empty, { intent: 'pricing' })).toMatchObject({ browsing: true, unlocked: false });
    expect(paywallContext(subscriber, { intent: 'pricing' }).unlocked).toBe(false);
    expect(paywallContext(subscriber, { intent: 'pricing', tourId: 'tour-a' }).unlocked).toBe(false);
  });

  it('treats a direct link without a valid target as a price overview', () => {
    expect(paywallContext(empty, {})).toEqual({ browsing: true, downloading: false, unlocked: false });
    expect(paywallContext(empty, { kind: 'session', intent: 'download' })).toEqual({
      browsing: true,
      downloading: false,
      unlocked: false,
    });
  });

  it('still dismisses the tour or session paywall when access has been granted', () => {
    expect(paywallContext(empty, { tourId: 'tour-a' }).unlocked).toBe(false);
    expect(paywallContext(subscriber, { tourId: 'tour-a' }).unlocked).toBe(true);
    expect(paywallContext(subscriber, { kind: 'session', placeId: 'berlin', mode: 'fork' }).unlocked).toBe(
      true,
    );
    previewConfig.paywall = false;
    expect(paywallContext(empty, { tourId: 'tour-a' }).unlocked).toBe(false);
    expect(paywallContext(empty, { kind: 'session', placeId: 'berlin', mode: 'fork' }).unlocked).toBe(false);
  });

  it('keeps purchase-only downloads gated when the old preview flag is disabled', () => {
    previewConfig.paywall = false;
    expect(paywallContext(empty, { tourId: 'tour-a', intent: 'download' })).toEqual({
      browsing: false,
      downloading: true,
      unlocked: false,
    });
    expect(paywallContext(subscriber, { tourId: 'tour-a', intent: 'download' }).unlocked).toBe(true);
  });
});

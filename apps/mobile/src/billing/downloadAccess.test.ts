import { afterEach, describe, expect, it, vi } from 'vitest';
import { canDownloadTour, canStartTour } from './access';
import type { Entitlement } from '@tuur/shared';

const previewConfig = vi.hoisted(() => ({ paywall: true }));
vi.mock('../config', () => ({ config: previewConfig }));
afterEach(() => {
  previewConfig.paywall = true;
});

describe('download controls use paid access independently of playback', () => {
  it('does not let the Expo Go preview bypass purchase-only audio or downloads', () => {
    previewConfig.paywall = false;
    const state = { entitlements: [] };
    expect(canStartTour(state, 'tour-a', false)).toBe(false);
    expect(canDownloadTour(state, { tourId: 'tour-a', mode: 'tour' })).toBe(false);
  });

  it.each(['free', 'reward'] as const)('%s grants authorize neither audio nor saving the tour', (source) => {
    previewConfig.paywall = true;
    const entitlements: Entitlement[] = [
      { type: 'tour', tourId: 'tour-a', source, grantedAt: 1, expiresAt: null },
    ];
    expect(canStartTour({ entitlements }, 'tour-a', source === 'free', 100)).toBe(false);
    expect(canDownloadTour({ entitlements }, { tourId: 'tour-a', mode: 'tour' }, 100)).toBe(false);
  });

  it('retains purchased legacy gift audio while downloads still need a purchase', () => {
    const entitlements: Entitlement[] = [
      { type: 'tour', tourId: 'tour-a', source: 'invite', grantedAt: 1, expiresAt: null },
    ];
    expect(canStartTour({ entitlements }, 'tour-a', false, 100)).toBe(true);
    expect(canDownloadTour({ entitlements }, { tourId: 'tour-a', mode: 'tour' }, 100)).toBe(false);
  });
});

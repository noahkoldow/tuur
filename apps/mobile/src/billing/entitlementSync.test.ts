import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntitlementState, UserInfo } from '../backend/types';

const controls = vi.hoisted(() => ({
  authChanged: (_user: UserInfo | null) => undefined as void,
  entitlementCallbacks: [] as ((state: EntitlementState) => void)[],
  cleanup: () => undefined as void,
  init: vi.fn(async () => undefined),
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => () => void) => {
    controls.cleanup = effect();
  },
}));
vi.mock('../backend', () => ({
  getBackend: () => ({
    auth: {
      onChange: (callback: typeof controls.authChanged) => {
        controls.authChanged = callback;
        return () => undefined;
      },
    },
    watchEntitlements: (callback: (state: EntitlementState) => void) => {
      controls.entitlementCallbacks.push(callback);
      return () => undefined;
    },
  }),
}));
vi.mock('./create', () => ({ createBilling: () => ({ init: controls.init }) }));
vi.mock('../ads/create', () => ({ createAds: () => ({}) }));

import { setMonetizationForTests, useEntitlementStore, useEntitlementSync } from './entitlements';

describe('account-bound entitlement synchronization', () => {
  beforeEach(() => {
    controls.entitlementCallbacks = [];
    controls.init.mockClear();
    setMonetizationForTests();
    useEntitlementStore.setState({
      loaded: false,
      entitlements: [],
      wallet: { balance: 0, rewardBalance: 0 },
    });
    useEntitlementSync();
  });

  it('does not initialize billing or read entitlements without a primary account', () => {
    controls.authChanged(null);
    controls.authChanged({ uid: 'legacy', isAnonymous: true });
    controls.authChanged({ uid: 'no-provider', isAnonymous: false, providerIds: [] });
    controls.authChanged({
      uid: 'phone-only',
      isAnonymous: false,
      phoneNumber: '+491701234567',
      providerIds: ['phone'],
    });
    expect(controls.entitlementCallbacks).toHaveLength(0);
    expect(controls.init).not.toHaveBeenCalled();
    controls.cleanup();
  });

  it.each(['password', 'apple.com', 'google.com'])(
    'initializes billing and loads entitlements for a %s account without a phone',
    (provider) => {
      controls.authChanged({ uid: 'primary', isAnonymous: false, providerIds: [provider] });
      expect(controls.init).toHaveBeenCalledExactlyOnceWith('primary');
      expect(controls.entitlementCallbacks).toHaveLength(1);
      controls.entitlementCallbacks[0]!({
        entitlements: [],
        wallet: { balance: 3, rewardBalance: 0 },
      });
      expect(useEntitlementStore.getState()).toMatchObject({ loaded: true, wallet: { balance: 3 } });
      controls.cleanup();
    },
  );

  it('clears the previous wallet before switching owners and ignores their queued updates', () => {
    controls.authChanged({ uid: 'a', isAnonymous: false, phoneNumber: '+491701234567' });
    const first = controls.entitlementCallbacks[0]!;
    first({ entitlements: [], wallet: { balance: 10, rewardBalance: 1 } });
    expect(useEntitlementStore.getState().wallet.balance).toBe(10);
    controls.authChanged({ uid: 'b', isAnonymous: false, phoneNumber: '+491709876543' });
    expect(useEntitlementStore.getState()).toMatchObject({ loaded: false, wallet: { balance: 0 } });
    first({ entitlements: [], wallet: { balance: 99, rewardBalance: 1 } });
    expect(useEntitlementStore.getState().wallet.balance).toBe(0);
    const second = controls.entitlementCallbacks[1]!;
    second({ entitlements: [], wallet: { balance: 2, rewardBalance: 0 } });
    expect(useEntitlementStore.getState().wallet.balance).toBe(2);
    controls.authChanged(null);
    second({ entitlements: [], wallet: { balance: 99, rewardBalance: 0 } });
    expect(useEntitlementStore.getState()).toMatchObject({ loaded: false, wallet: { balance: 0 } });
    controls.cleanup();
  });
});

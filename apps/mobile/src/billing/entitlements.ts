import { useEffect } from 'react';
import { create } from 'zustand';
import type { Entitlement, Wallet } from '@tuur/shared';
import { getBackend } from '../backend';
import { createAds } from '../ads/create';
import type { AdsProvider } from '../ads/types';
import { createBilling } from './create';
import type { BillingProvider } from './types';

export interface EntState {
  loaded: boolean;
  entitlements: Entitlement[];
  wallet: Wallet;
}

export const useEntitlementStore = create<EntState>(() => ({
  loaded: false,
  entitlements: [],
  wallet: { balance: 0, rewardBalance: 0 },
}));

let billing: BillingProvider | undefined;
let ads: AdsProvider | undefined;
export const getBilling = () => (billing ??= createBilling(getBackend()));
export const getAds = () => (ads ??= createAds(getBackend()));
export function setMonetizationForTests(b?: BillingProvider, a?: AdsProvider) {
  billing = b;
  ads = a;
}

/** Mounted once in the root layout: mirrors the server-written entitlements and initializes the store SDK. */
export function useEntitlementSync() {
  useEffect(() => {
    const backend = getBackend();
    let off: (() => void) | undefined;
    const offAuth = backend.auth.onChange((u) => {
      off?.();
      off = undefined;
      if (!u) return void useEntitlementStore.setState({ loaded: false, entitlements: [] });
      off = backend.watchEntitlements((s) =>
        useEntitlementStore.setState({ loaded: true, entitlements: s.entitlements, wallet: s.wallet }),
      );
      void getBilling()
        .init(u.uid)
        .catch(() => undefined);
    });
    void backend.auth.ensureSignedIn().catch(() => undefined);
    return () => {
      off?.();
      offAuth();
    };
  }, []);
}

export { canStartTour, canUseSession, subscribed } from './access';

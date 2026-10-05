import { useEffect } from 'react';
import { create } from 'zustand';
import type { Entitlement, Wallet } from '@tuur/shared';
import { getBackend } from '../backend';
import { accountStep } from '../auth/policy';
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
    let generation = 0;
    const offAuth = backend.auth.onChange((u) => {
      const current = ++generation;
      off?.();
      off = undefined;
      useEntitlementStore.setState({
        loaded: false,
        entitlements: [],
        wallet: { balance: 0, rewardBalance: 0 },
      });
      if (!u || accountStep(u) !== 'ready') return;
      off = backend.watchEntitlements((s) => {
        if (current === generation)
          useEntitlementStore.setState({ loaded: true, entitlements: s.entitlements, wallet: s.wallet });
      });
      void getBilling()
        .init(u.uid)
        .catch(() => undefined);
    });
    return () => {
      generation++;
      off?.();
      offAuth();
    };
  }, []);
}

export { canDownloadTour, canStartTour, canUseSession, subscribed } from './access';

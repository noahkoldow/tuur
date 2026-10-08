import { Platform } from 'react-native';
import type { BillingProvider, Offer, ProductId } from './types';

const KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
};

/** Thrown when the store SDK has no public key in this build; the paywall explains it instead of a generic error. */
export const UNCONFIGURED = 'billing_unconfigured';

const isSub = (id: string) => id.startsWith('tuur_sub_');

/** RevenueCat (react-native-purchases). The public SDK keys are not secrets; the server side uses the webhook. */
export function createRevenueCatBilling(): BillingProvider {
  let configured = false;
  let ready: Promise<void> = Promise.reject(new Error(UNCONFIGURED));
  ready.catch(() => undefined);
  const sdk = () => (require('react-native-purchases') as typeof import('react-native-purchases')).default;
  return {
    init(uid) {
      const apiKey = Platform.OS === 'ios' ? KEYS.ios : KEYS.android;
      ready = (async () => {
        if (!apiKey) throw new Error(UNCONFIGURED);
        const Purchases = sdk();
        if (!configured) {
          Purchases.configure({ apiKey, appUserID: uid });
          configured = true;
        } else {
          await Purchases.logIn(uid);
        }
      })();
      return ready;
    },
    async offers() {
      await ready;
      const Purchases = sdk();
      const list = await Purchases.getProducts([
        'tuur_credit_1',
        'tuur_credit_5',
        'tuur_sub_monthly',
        'tuur_sub_yearly',
        'tuur_group_seat',
      ]);
      return list.flatMap((p): Offer[] => {
        const id = p.identifier as ProductId;
        const credits = id === 'tuur_credit_5' ? 5 : 1;
        return [
          isSub(id)
            ? {
                id,
                kind: 'subscription',
                title: p.title,
                priceString: p.priceString,
                price: p.price,
                currency: p.currencyCode,
                period: id === 'tuur_sub_yearly' ? 'year' : 'month',
              }
            : {
                id,
                kind: id === 'tuur_group_seat' ? 'seat' : 'credit',
                title: p.title,
                priceString: p.priceString,
                price: p.price,
                currency: p.currencyCode,
                credits,
              },
        ];
      });
    },
    async purchase(id) {
      await ready;
      const Purchases = sdk();
      const [product] = await Purchases.getProducts([id]);
      if (!product) throw new Error('Product unavailable');
      try {
        await Purchases.purchaseStoreProduct(product);
        return 'purchased';
      } catch (e) {
        if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
        throw e;
      }
    },
    async restore() {
      await ready;
      await sdk().restorePurchases();
    },
  };
}

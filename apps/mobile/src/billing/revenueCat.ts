import { Platform } from 'react-native';
import type { BillingProvider, Offer, ProductId } from './types';

const KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
};

const isSub = (id: string) => id.startsWith('tuur_sub_');

/** RevenueCat (react-native-purchases). The public SDK keys are not secrets; the server side uses the webhook. */
export function createRevenueCatBilling(): BillingProvider {
  let configured = false;
  const sdk = () => (require('react-native-purchases') as typeof import('react-native-purchases')).default;
  return {
    async init(uid) {
      const apiKey = Platform.OS === 'ios' ? KEYS.ios : KEYS.android;
      if (!apiKey) throw new Error('RevenueCat key missing');
      const Purchases = sdk();
      if (!configured) {
        Purchases.configure({ apiKey, appUserID: uid });
        configured = true;
      } else {
        await Purchases.logIn(uid);
      }
    },
    async offers() {
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
      await sdk().restorePurchases();
    },
  };
}

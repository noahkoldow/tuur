import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Wordmark } from '../src/components/Brand';
import { Checkbox } from '../src/components/Checkbox';
import { yearlyValue } from '../src/billing/pricing';
import { useBackend, BackendError } from '../src/backend';
import { Banner } from '../src/components/Banner';
import { Button, Row } from '../src/components/Button';
import { CloseButton } from '../src/components/HeaderButton';
import { ScrollScreen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { config } from '../src/config';
import type { Offer } from '../src/billing/types';
import {
  canDownloadTour,
  canStartTour,
  canUseSession,
  getAds,
  getBilling,
  subscribed,
  useEntitlementStore,
} from '../src/billing/entitlements';
import { metrics, sys } from '../src/theme';

type Params = {
  kind?: 'tour' | 'session';
  tourId?: string;
  placeId?: string;
  mode?: 'planned' | 'fork' | 'roam';
  intent?: 'download';
};

/**
 * Paywall (spec 6): credit, subscription (with the full disclosure required by the stores), rewarded ad (tours only)
 * and restore. Entitlements are only ever read from the server; this screen closes itself once access exists.
 */
export default function Paywall() {
  const { kind = 'tour', tourId, placeId, mode = 'planned', intent } = useLocalSearchParams<Params>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const ent = useEntitlementStore();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | undefined>();
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'warning' | 'error' } | undefined>();
  const [waitingReward, setWaitingReward] = useState(false);
  const [consent, setConsent] = useState(false);

  const downloading = intent === 'download';
  const unlocked = downloading
    ? canDownloadTour(ent, {
        ...(tourId ? { tourId } : {}),
        ...(placeId ? { placeId } : {}),
        mode: kind === 'tour' ? 'tour' : mode,
      })
    : kind === 'tour' && tourId
      ? canStartTour(ent, tourId, false)
      : canUseSession(ent, mode, placeId);
  const isSub = subscribed(ent);

  useEffect(() => {
    void getBilling()
      .offers()
      .then(setOffers)
      .catch(() => setMessage({ text: t('paywall.failed'), tone: 'warning' }));
  }, [t]);

  useEffect(() => {
    if (unlocked) router.back();
  }, [unlocked, router]);

  useEffect(() => {
    if (!waitingReward) return;
    if (unlocked) return setWaitingReward(false);
    // the server credits the reward after verification; do not spin forever if it never arrives
    const timer = setTimeout(() => {
      setWaitingReward(false);
      setMessage({ text: t('paywall.failed'), tone: 'warning' });
    }, 90_000);
    return () => clearTimeout(timer);
  }, [waitingReward, unlocked, t]);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setMessage(undefined);
    try {
      await fn();
    } catch (e) {
      const code = e instanceof BackendError ? e.code : undefined;
      setMessage({
        text: code === 'insufficient_credit' ? t('paywall.insufficient') : t('paywall.failed'),
        tone: 'error',
      });
    } finally {
      setBusy(undefined);
    }
  };

  const total = ent.wallet.balance + (kind === 'tour' && !downloading ? ent.wallet.rewardBalance : 0);
  const spend = () =>
    run('spend', async () => {
      await backend.spendCredit(
        kind === 'tour'
          ? { kind: 'tour', tourId: tourId!, ...(downloading ? { paidOnly: true } : {}) }
          : { kind: 'session', placeId: placeId! },
      );
    });

  const buy = (o: Offer) =>
    run(o.id, async () => {
      if (!consent) return setMessage({ text: t('paywall.consentNeeded'), tone: 'warning' });
      // express consent to immediate delivery is recorded server-side before the store sheet opens (Sec. 356(5) BGB)
      await backend.recordPurchaseConsent(o.id);
      const r = await getBilling().purchase(o.id);
      if (r === 'purchased') setMessage({ text: t('paywall.purchasePending'), tone: 'info' });
    });

  const watchAd = () =>
    run('ad', async () => {
      const ads = getAds();
      if (ads.consent() === 'unknown') await ads.gatherConsent();
      const uid = (await backend.auth.ensureSignedIn()).uid;
      let nonce: string;
      try {
        if (!tourId) throw new Error('Tour is missing');
        nonce = (await backend.createRewardNonce({ tourId })).nonce;
      } catch (e) {
        if (e instanceof BackendError && e.code === 'rate_limited') {
          setMessage({ text: t('paywall.adLimit'), tone: 'warning' });
          return;
        }
        throw e;
      }
      const outcome = await ads.showRewarded({ userId: uid, nonce });
      if (outcome === 'earned') {
        setWaitingReward(true);
        setMessage({ text: t('paywall.adPending'), tone: 'info' });
      } else if (outcome === 'unavailable') setMessage({ text: t('paywall.adUnavailable'), tone: 'warning' });
    });

  const restore = () =>
    run('restore', async () => {
      await getBilling().restore();
      setMessage({ text: t('paywall.restored'), tone: 'info' });
    });

  const credits = offers.filter((o) => o.kind === 'credit');
  const subs = offers.filter((o) => o.kind === 'subscription');
  const monthly = subs.find((o) => o.period === 'month');
  const yearly = subs.find((o) => o.period === 'year');
  const value = yearlyValue(monthly, yearly, i18n.language);
  const open = (doc: string) => void Linking.openURL(`${config.legal.webBaseUrl}/legal/${doc}`);
  const manageSubs = () =>
    void Linking.openURL(
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions',
    );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: sys.grouped as string },
          headerRight: () => <CloseButton label={t('paywall.close')} onPress={() => router.back()} />,
        }}
      />
      <ScrollScreen>
        <View style={{ gap: 8 }}>
          <Wordmark width={72} />
          <Text variant="title1" accessibilityRole="header">
            {downloading
              ? t('paywall.titleDownload')
              : kind === 'tour'
                ? t('paywall.title')
                : t('paywall.titleSession')}
          </Text>
          <Text variant="body" color={sys.labelSecondary}>
            {downloading
              ? t('paywall.subtitleDownload')
              : kind === 'tour'
                ? t('paywall.subtitleTour')
                : t('paywall.subtitleSession')}
          </Text>
        </View>
        {message ? <Banner text={message.text} tone={message.tone} /> : null}
        {isSub ? <Banner text={t('paywall.subscribed')} icon="check-circle" /> : null}

        {total > 0 ? (
          <Card>
            <Text variant="headline">{t('paywall.balance', { count: total })}</Text>
            {kind === 'tour' && !downloading && ent.wallet.rewardBalance > 0 ? (
              <Text variant="footnote">
                {t('paywall.balanceReward', { count: ent.wallet.rewardBalance })}
              </Text>
            ) : null}
            <Button
              label={busy === 'spend' ? t('paywall.unlocking') : t('paywall.unlockWithCredit')}
              loading={busy === 'spend'}
              onPress={() => void spend()}
            />
          </Card>
        ) : null}

        <Checkbox checked={consent} onChange={setConsent} label={t('paywall.withdrawal')} />

        <Card>
          {credits.map((o) => (
            <Button
              key={o.id}
              // one filled primary on the screen: the single credit; everything else is secondary
              variant={o.credits === 5 || total > 0 ? 'secondary' : 'primary'}
              label={`${o.credits === 5 ? t('paywall.buyCredits5') : t('paywall.buyCredit')} · ${o.priceString}`}
              loading={busy === o.id}
              onPress={() => void buy(o)}
            />
          ))}
          <Text variant="footnote">{t('paywall.creditHint')}</Text>
        </Card>

        {subs.length ? (
          <Card>
            <Text variant="headline">{t('paywall.subscribe')}</Text>
            {[yearly, monthly]
              .flatMap((o) => (o ? [o] : []))
              .map((o) => (
                <View key={o.id} style={{ gap: 6 }}>
                  {o.period === 'year' ? (
                    <Text variant="subheadline" color={sys.accentText} style={{ fontWeight: '600' }}>
                      {value && value.savedPercent > 0
                        ? `${t('paywall.recommended')} · ${t('paywall.saveBadge', { percent: value.savedPercent })}`
                        : t('paywall.recommended')}
                    </Text>
                  ) : null}
                  <Button
                    variant="secondary"
                    label={t(o.period === 'year' ? 'paywall.subYearly' : 'paywall.subMonthly', {
                      price: o.priceString,
                    })}
                    loading={busy === o.id}
                    onPress={() => void buy(o)}
                  />
                  {o.period === 'year' && value ? (
                    <Text variant="footnote">{t('paywall.perMonth', { price: value.perMonthString })}</Text>
                  ) : null}
                </View>
              ))}
            <Text variant="footnote">{t('paywall.subDisclosure')}</Text>
            <Button variant="ghost" size="regular" label={t('paywall.manageSubs')} onPress={manageSubs} />
          </Card>
        ) : null}

        {kind === 'tour' && !isSub && !downloading ? (
          <Card>
            <Button
              variant="secondary"
              icon="play-circle"
              label={t('paywall.watchAd')}
              loading={busy === 'ad' || waitingReward}
              onPress={() => void watchAd()}
            />
            <Text variant="footnote">{t('paywall.watchAdHint')}</Text>
          </Card>
        ) : null}

        <Button
          variant="ghost"
          label={t('paywall.restore')}
          loading={busy === 'restore'}
          onPress={() => void restore()}
        />
        <Row gap={8} style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="ghost" size="regular" label={t('paywall.terms')} onPress={() => open('terms')} />
          <Button
            variant="ghost"
            size="regular"
            label={t('paywall.privacy')}
            onPress={() => open('privacy')}
          />
        </Row>
      </ScrollScreen>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        gap: 12,
        padding: metrics.margin,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: sys.elevated,
      }}
    >
      {children}
    </View>
  );
}

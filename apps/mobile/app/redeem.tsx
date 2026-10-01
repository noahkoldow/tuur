import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackendError, useBackend, type RedemptionToken } from '../src/backend';
import { Banner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { CloseButton } from '../src/components/HeaderButton';
import { Icon } from '../src/components/Icon';
import { QrCode } from '../src/components/QrCode';
import { Screen } from '../src/components/Screen';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { config } from '../src/config';
import { currentPosition } from '../src/location/real';
import { usePosition } from '../src/location/usePosition';
import { metrics, sys } from '../src/theme';

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** QR redemption (spec 7.2): signed single-use code with countdown; turns into a confirmation once the partner scanned it. */
export default function Redeem() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { position } = usePosition();
  const [token, setToken] = useState<RedemptionToken | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(true);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(Date.now());

  const create = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      await backend.auth.ensureSignedIn();
      const pos = config.backend === 'demo' ? position : await currentPosition();
      if (!pos) return setError(t('partner.needLocation'));
      setToken(await backend.createRedemptionToken({ offerId, position: pos }));
    } catch (e) {
      const reason = e instanceof BackendError ? e.reason : undefined;
      setError(
        reason === 'too_far'
          ? t('partner.tooFar')
          : reason === 'already_redeemed_today'
            ? t('partner.already')
            : reason === 'daily_limit'
              ? t('partner.limit')
              : reason
                ? t('partner.unavailable')
                : t('errors.generic'),
      );
    } finally {
      setBusy(false);
    }
  }, [backend, offerId, position, t]);

  useEffect(() => {
    if (config.backend === 'demo' && !position) return;
    void create();
    // only once per screen visit (a new code is requested explicitly)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(position)]);

  useEffect(() => {
    if (!token) return;
    const off = backend.watchRedemption(token.tokenId, (used) => used && setDone(true));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      off();
      clearInterval(tick);
    };
  }, [backend, token]);

  const left = token ? token.expiresAt - now : 0;
  const expired = Boolean(token) && left <= 0 && !done;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerShadowVisible: false,
          headerRight: () => <CloseButton label={t('paywall.close')} onPress={() => router.back()} />,
        }}
      />
      <Screen padded>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {busy ? (
            <SpinningMark size={72} label={t('common.loading')} />
          ) : error ? (
            <>
              <Icon name="alert-circle" size={44} color={sys.labelSecondary} />
              <Text variant="title2" accessibilityRole="header" align="center">
                {t('partner.errorTitle')}
              </Text>
              <Text variant="body" color={sys.labelSecondary} align="center">
                {error}
              </Text>
              <Button variant="secondary" label={t('partner.newCode')} onPress={() => void create()} />
            </>
          ) : token && done ? (
            <>
              <Banner icon="check-circle" text={t('partner.redeemed')} />
              <Text variant="headline">{token.offerTitle}</Text>
              <Button label={t('paywall.close')} onPress={() => router.back()} />
            </>
          ) : token ? (
            <>
              <Text variant="title2" accessibilityRole="header" align="center">
                {t('partner.qrTitle')}
              </Text>
              <Text variant="headline" align="center">
                {token.offerTitle} · {token.partnerName}
              </Text>
              <View
                style={{
                  opacity: expired ? 0.25 : 1,
                  padding: 16,
                  borderRadius: metrics.radius.card,
                  borderCurve: 'continuous',
                  // QR codes need a light quiet zone in both appearances
                  backgroundColor: '#FFFFFF',
                }}
              >
                <QrCode value={token.token} size={248} label={token.offerTitle} />
              </View>
              {expired ? (
                <>
                  <Banner tone="warning" text={t('partner.expired')} />
                  <Button label={t('partner.newCode')} onPress={() => void create()} />
                </>
              ) : (
                <>
                  <Text variant="headline" color={sys.accentText}>
                    {t('partner.expiresIn', { time: fmt(left) })}
                  </Text>
                  <Text variant="footnote" align="center">
                    {t('partner.qrHint')}
                  </Text>
                </>
              )}
            </>
          ) : null}
        </View>
      </Screen>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackendError, useBackend, type RedemptionToken } from '../src/backend';
import { Banner } from '../src/components/Banner';
import { Button, IconButton, Row } from '../src/components/Button';
import { QrCode } from '../src/components/QrCode';
import { Screen } from '../src/components/Screen';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { config } from '../src/config';
import { currentPosition } from '../src/location/real';
import { usePosition } from '../src/location/usePosition';
import { colors } from '../src/theme';

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
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="x" label={t('paywall.close')} onPress={() => router.back()} size={44} />
      </Row>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {busy ? (
          <SpinningMark size={72} label={t('common.loading')} />
        ) : error ? (
          <>
            <Feather name="alert-circle" size={44} color={colors.ink.secondary} />
            <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
              {t('partner.errorTitle')}
            </Text>
            <Text variant="bodySecondary" style={{ textAlign: 'center' }}>
              {error}
            </Text>
            <Button variant="secondary" label={t('partner.newCode')} onPress={() => void create()} />
          </>
        ) : token && done ? (
          <>
            <Banner icon="check-circle" text={t('partner.redeemed')} />
            <Text variant="heading">{token.offerTitle}</Text>
            <Button label={t('paywall.close')} onPress={() => router.back()} />
          </>
        ) : token ? (
          <>
            <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
              {t('partner.qrTitle')}
            </Text>
            <Text variant="heading" style={{ textAlign: 'center' }}>
              {token.offerTitle} · {token.partnerName}
            </Text>
            <View style={{ opacity: expired ? 0.25 : 1 }}>
              <QrCode value={token.token} size={260} label={token.offerTitle} />
            </View>
            {expired ? (
              <>
                <Banner tone="warning" text={t('partner.expired')} />
                <Button label={t('partner.newCode')} onPress={() => void create()} />
              </>
            ) : (
              <>
                <Text variant="heading" color={colors.brand.redPressed}>
                  {t('partner.expiresIn', { time: fmt(left) })}
                </Text>
                <Text variant="caption" style={{ textAlign: 'center' }}>
                  {t('partner.qrHint')}
                </Text>
              </>
            )}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

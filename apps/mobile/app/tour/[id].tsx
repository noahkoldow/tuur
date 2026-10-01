import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Tour } from '@tuur/shared';
import { BackendError, useBackend } from '../../src/backend';
import { canStartTour, useEntitlementStore } from '../../src/billing/entitlements';
import { formatKm } from '../../src/format';
import { config } from '../../src/config';
import { ImageCredit } from '../../src/components/ImageCredit';
import { AiBadge } from '../../src/components/AiBadge';
import { Banner } from '../../src/components/Banner';
import { Button, Row } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { FloatingAction } from '../../src/components/FloatingAction';
import { SpinningMark } from '../../src/components/SpinningMark';
import { ListGroup, ListRow } from '../../src/components/ListGroup';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TuurMap } from '../../src/components/TuurMap';
import { startTourSession, tourPath } from '../../src/guide/session';
import { requestBackground } from '../../src/location/real';
import { useTourDownload } from '../../src/offline/useDownload';
import { estimateDownloadBytes, formatBytes } from '@tuur/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../src/state/settings';
import { metrics, sys } from '../../src/theme';

/** Tour preview (spec 5): map with the route, facts, stops with walking times, start. */
export default function TourDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const { language, interests, simulator } = useSettings();
  const [tour, setTour] = useState<Tour | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const dl = useTourDownload(tour, language);
  const ent = useEntitlementStore();
  const [shareMsg, setShareMsg] = useState<string | undefined>();

  const [reload, setReload] = useState(0);
  const [startError, setStartError] = useState<false | 'denied' | 'failed'>(false);

  useEffect(() => {
    let cancelled = false;
    setTour(undefined);
    backend
      .getTour(id)
      .then((r) => !cancelled && setTour(r))
      .catch(() => !cancelled && setTour(null));
    return () => {
      cancelled = true;
    };
  }, [backend, id, reload]);

  const path = useMemo(() => (tour ? tourPath(tour) : []), [tour]);
  if (tour === undefined)
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <SpinningMark size={64} label={t('common.loading')} />
        </View>
      </Screen>
    );
  if (tour === null)
    return (
      <Screen>
        <Banner tone="error" text={t('errors.generic')} />
        <Button variant="secondary" label={t('common.retry')} onPress={() => setReload((n) => n + 1)} />
        <Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />
      </Screen>
    );
  const text = tour.texts[language] ?? tour.texts['en'] ?? Object.values(tour.texts)[0];

  const unlocked = canStartTour(ent, tour.id, tour.free);
  const bought = ent.entitlements.some(
    (e) => e.type === 'tour' && e.tourId === tour.id && e.source === 'credit',
  );
  const openPaywall = () => router.push({ pathname: '/paywall', params: { kind: 'tour', tourId: tour.id } });

  const share = async () => {
    setShareMsg(undefined);
    try {
      const inv = await backend.createInvite(tour.id);
      const url = `${config.legal.webBaseUrl}/invite/${inv.token}`;
      await Share.share({ message: t('paywall.shareMessage', { url }) });
    } catch (e) {
      setShareMsg(
        e instanceof BackendError && e.reason === 'limit_reached'
          ? t('paywall.shareLimit')
          : t('paywall.failed'),
      );
    }
  };

  const start = async () => {
    if (!unlocked) return openPaywall();
    setStarting(true);
    setStartError(false);
    try {
      let foregroundOnly = false;
      if (!simulator && backend.kind === 'firebase') {
        const perm = await requestBackground();
        if (perm === 'denied') return setStartError('denied');
        foregroundOnly = perm === 'foreground';
      }
      await startTourSession({
        tour,
        lang: language,
        ...(interests[0] ? { interest: interests[0] } : {}),
        simulate: simulator,
        ...(foregroundOnly ? { foregroundOnly } : {}),
      });
      router.replace('/play');
    } catch {
      setStartError('failed');
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <Stack.Screen
        options={{ headerShown: true, title: '', headerTransparent: true, headerShadowVisible: false }}
      />
      <View style={{ height: 280 }}>
        <TuurMap
          center={tour.stops[0]!.location}
          route={path}
          fit={path}
          stops={tour.stops.map((s, i) => ({
            id: s.poiId,
            location: s.location,
            number: i + 1,
            state: 'upcoming',
            partner: s.partner,
          }))}
        />
      </View>
      <ScrollView
        style={{
          marginTop: -28,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderCurve: 'continuous',
          backgroundColor: sys.grouped,
        }}
        contentContainerStyle={{
          padding: metrics.margin,
          paddingTop: 24,
          gap: 24,
          paddingBottom: insets.bottom + 96,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text variant="title1" accessibilityRole="header">
            {text?.title ?? tour.template}
          </Text>
          <Text variant="body" color={sys.labelSecondary}>
            {text?.description}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            borderRadius: metrics.radius.card,
            borderCurve: 'continuous',
            backgroundColor: sys.elevated,
          }}
        >
          <Fact
            label={t('tour.duration')}
            value={t('common.minutes', { count: Math.round(tour.durationMinutes) })}
          />
          <View style={{ width: 0.5, backgroundColor: sys.separator, marginVertical: 12 }} />
          <Fact
            label={t('tour.distance')}
            value={t('common.km', { value: formatKm(tour.distanceMeters, language) })}
          />
          <View style={{ width: 0.5, backgroundColor: sys.separator, marginVertical: 12 }} />
          <Fact label={t('tour.stopsTitle')} value={String(tour.stops.length)} />
        </View>

        {tour.themes.length ? (
          <View style={{ gap: 8 }}>
            <Text
              variant="footnote"
              style={{ textTransform: 'uppercase', paddingHorizontal: metrics.margin }}
            >
              {t('tour.themes')}
            </Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {tour.themes.map((th) => (
                <Chip key={th} label={t(`interests.${th}`)} selected />
              ))}
            </Row>
          </View>
        ) : null}
        {tour.hasPartner ? <Banner text={t('tour.sponsored')} icon="award" /> : null}

        <ListGroup title={t('tour.stopsTitle')}>
          {tour.stops.map((s, i) => (
            <ListRow
              key={s.poiId}
              label={`${i + 1}. ${s.name}`}
              {...(i > 0
                ? { hint: t('tour.walkFromPrev', { minutes: Math.round(s.walkMinutesFromPrev) }) }
                : {})}
              {...(s.partner ? { value: t('common.partner') } : {})}
            />
          ))}
        </ListGroup>

        <ListGroup>
          {dl.complete ? (
            <ListRow icon="check-circle" label={t('downloads.downloaded')} />
          ) : dl.phase === 'running' ? (
            <ListRow
              icon="download"
              label={t('downloads.downloading', { percent: Math.round(dl.fraction * 100) })}
              trailing={
                <Button variant="ghost" size="regular" label={t('downloads.cancel')} onPress={dl.cancel} />
              }
            />
          ) : (
            <ListRow
              icon="download"
              label={
                dl.partial
                  ? t('downloads.resume')
                  : `${t('downloads.download')} (${t('downloads.size', { size: formatBytes(estimateDownloadBytes(tour)) })})`
              }
              onPress={() => (unlocked ? void dl.start() : openPaywall())}
            />
          )}
          {bought ? (
            <ListRow
              icon="share"
              label={t('paywall.share')}
              hint={t('paywall.shareHint')}
              onPress={() => void share()}
            />
          ) : null}
        </ListGroup>
        {dl.error ? (
          <Banner
            tone="warning"
            text={dl.error === 'no_space' ? t('downloads.noSpace') : t('downloads.failed')}
          />
        ) : null}
        {shareMsg ? <Banner tone="warning" text={shareMsg} /> : null}
        {startError ? (
          <Banner
            tone="error"
            text={startError === 'denied' ? t('errors.locationDenied') : t('errors.startFailed')}
          />
        ) : null}

        <AiBadge text={t('tour.aiNotice')} />
        {tour.coverImage ? (
          <View style={{ borderRadius: metrics.radius.card, borderCurve: 'continuous', overflow: 'hidden' }}>
            <Image
              source={{ uri: tour.coverImage.url }}
              style={{ height: 160 }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
            <ImageCredit image={tour.coverImage} style={{ padding: 8 }} />
          </View>
        ) : null}
      </ScrollView>

      <FloatingAction>
        <Button
          label={unlocked ? t('tour.start') : t('paywall.title')}
          icon={unlocked ? 'play' : 'lock'}
          loading={starting}
          onPress={() => void start()}
        />
      </FloatingAction>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{ flex: 1, padding: 14, gap: 2, alignItems: 'center' }}
    >
      <Text variant="headline">{value}</Text>
      <Text variant="footnote" align="center">
        {label}
      </Text>
    </View>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Tour } from '@tuur/shared';
import { BackendError, useBackend } from '../../src/backend';
import { canStartTour, useEntitlementStore } from '../../src/billing/entitlements';
import { config } from '../../src/config';
import { ImageCredit } from '../../src/components/ImageCredit';
import { AiBadge } from '../../src/components/AiBadge';
import { Banner } from '../../src/components/Banner';
import { Button, IconButton, Row } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { SpinningMark } from '../../src/components/SpinningMark';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TuurMap } from '../../src/components/TuurMap';
import { startTourSession, tourPath } from '../../src/guide/session';
import { requestBackground } from '../../src/location/real';
import { useTourDownload } from '../../src/offline/useDownload';
import { estimateDownloadBytes, formatBytes } from '@tuur/shared';
import { useSettings } from '../../src/state/settings';
import { colors, radii } from '../../src/theme';

/** Tour preview (spec 5): map with the route, facts, stops with walking times, start. */
export default function TourDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
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
    <Screen padded={false}>
      <View style={{ height: 240 }}>
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
        <View style={{ position: 'absolute', top: 12, left: 12 }}>
          <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} size={44} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 140 }}>
        <Text variant="title" accessibilityRole="header">
          {text?.title ?? tour.template}
        </Text>
        <Text variant="bodySecondary">{text?.description}</Text>

        <Row gap={10} style={{ flexWrap: 'wrap' }}>
          <Fact
            label={t('tour.duration')}
            value={t('common.minutes', { count: Math.round(tour.durationMinutes) })}
          />
          <Fact
            label={t('tour.distance')}
            value={t('common.km', { value: (tour.distanceMeters / 1000).toFixed(1) })}
          />
          <Fact label={t('tour.stopsTitle')} value={String(tour.stops.length)} />
        </Row>
        {tour.themes.length ? (
          <View style={{ gap: 8 }}>
            <Text variant="label">{t('tour.themes')}</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {tour.themes.map((th) => (
                <Chip key={th} label={t(`interests.${th}`)} selected />
              ))}
            </Row>
          </View>
        ) : null}
        {tour.hasPartner ? <Banner text={t('tour.sponsored')} icon="award" /> : null}

        <Text variant="heading" accessibilityRole="header">
          {t('tour.stopsTitle')}
        </Text>
        <View style={{ gap: 4 }}>
          {tour.stops.map((s, i) => (
            <Row key={s.poiId} gap={12} style={{ paddingVertical: 8 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.brand.redTint,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="label" color={colors.brand.redPressed}>
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body">{s.name}</Text>
                {i > 0 ? (
                  <Text variant="caption">
                    {t('tour.walkFromPrev', { minutes: Math.round(s.walkMinutesFromPrev) })}
                  </Text>
                ) : null}
              </View>
              {s.partner ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.brand.red,
                  }}
                >
                  <Text variant="caption">{t('common.partner')}</Text>
                </View>
              ) : null}
            </Row>
          ))}
        </View>
        <AiBadge text={t('tour.aiNotice')} />
        {tour.coverImage ? (
          <View style={{ borderRadius: radii.md, overflow: 'hidden' }}>
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
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 24,
          gap: 10,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Button
          label={unlocked ? t('tour.start') : t('paywall.title')}
          icon={unlocked ? 'play' : 'lock'}
          loading={starting}
          onPress={() => void start()}
        />
        {bought ? (
          <Button
            variant="secondary"
            icon="share-2"
            label={t('paywall.share')}
            accessibilityHint={t('paywall.shareHint')}
            onPress={() => void share()}
          />
        ) : null}
        {shareMsg ? <Banner tone="warning" text={shareMsg} /> : null}
        {startError ? (
          <Banner
            tone="error"
            text={startError === 'denied' ? t('errors.locationDenied') : t('errors.startFailed')}
          />
        ) : null}
        {dl.complete ? (
          <Banner icon="check-circle" text={t('downloads.downloaded')} />
        ) : dl.phase === 'running' ? (
          <Row gap={10}>
            <Button
              style={{ flex: 1 }}
              variant="secondary"
              label={t('downloads.downloading', { percent: Math.round(dl.fraction * 100) })}
              onPress={() => undefined}
              disabled
            />
            <Button variant="ghost" label={t('downloads.cancel')} onPress={dl.cancel} />
          </Row>
        ) : (
          <Button
            variant="secondary"
            icon="download"
            label={
              dl.partial
                ? t('downloads.resume')
                : `${t('downloads.download')} (${t('downloads.size', { size: formatBytes(estimateDownloadBytes(tour)) })})`
            }
            onPress={() => (unlocked ? void dl.start() : openPaywall())}
          />
        )}
        {dl.error ? (
          <Banner
            tone="warning"
            text={dl.error === 'no_space' ? t('downloads.noSpace') : t('downloads.failed')}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: radii.md,
        backgroundColor: colors.surface.subtle,
      }}
    >
      <Text variant="caption">{label}</Text>
      <Text variant="heading">{value}</Text>
    </View>
  );
}

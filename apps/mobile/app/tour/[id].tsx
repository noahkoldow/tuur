import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Tour } from '@tuur/shared';
import { BackendError, useBackend } from '../../src/backend';
import { canDownloadTour, subscribed, useEntitlementStore } from '../../src/billing/entitlements';
import { formatKm } from '../../src/format';
import { config } from '../../src/config';
import { PlacePhoto } from '../../src/components/PlacePhoto';
import { AiBadge } from '../../src/components/AiBadge';
import { Banner } from '../../src/components/Banner';
import { Button, Row } from '../../src/components/Button';
import { CategoryBadge } from '../../src/components/category-badge';
import { interestOf } from '../../src/components/StopCards';
import { FloatingAction } from '../../src/components/FloatingAction';
import { SpinningMark } from '../../src/components/SpinningMark';
import { ListGroup, ListRow } from '../../src/components/ListGroup';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { TuuSays } from '../../src/components/TuuSays';
import { TuurMap } from '../../src/components/TuurMap';
import { FreeTourIntroCancelled, startTourSession, tourPath } from '../../src/guide/session';
import { requestBackground } from '../../src/location/real';
import { useTourDownload } from '../../src/offline/useDownload';
import { getFileStore, getOfflineLibrary } from '../../src/offline';
import { loadDownloadedTour } from '../../src/offline/openDownloadedTour';
import { downloadedTourScript } from '../../src/offline/downloadScript';
import { estimateDownloadBytes, formatBytes } from '@tuur/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../src/state/settings';
import { metrics, sys } from '../../src/theme';
import { useStopPois } from '../../src/hooks/useStopPois';

/** Module-level so expo-router does not call navigation.setOptions on every render. */
const TOUR_HEADER = { headerShown: true, title: '', headerTransparent: true, headerShadowVisible: false } as const;

/** Tour preview (spec 5): map with the route, facts, stops with walking times, start. */
export default function TourDetail() {
  const { id, curated, adjusted, lang, download } = useLocalSearchParams<{
    id: string;
    curated?: string;
    adjusted?: string;
    lang?: string;
    download?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const { language: preferredLanguage, interests, simulator } = useSettings();
  const [savedLanguage, setSavedLanguage] = useState<string>();
  const language = savedLanguage ?? (lang === 'de' || lang === 'en' ? lang : preferredLanguage);
  const [tour, setTour] = useState<Tour | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const startInFlight = useRef(false);
  const dl = useTourDownload(tour, language);
  const ent = useEntitlementStore();
  const [shareMsg, setShareMsg] = useState<string | undefined>();

  const [reload, setReload] = useState(0);
  const [startError, setStartError] = useState<false | 'denied' | 'failed'>(false);

  useEffect(() => {
    let cancelled = false;
    setTour(undefined);
    setSavedLanguage(undefined);
    const load = async () => {
      if (download === '1') {
        const saved = await loadDownloadedTour({
          auth: backend.auth,
          library: getOfflineLibrary(),
          files: getFileStore(),
          tourId: id,
        });
        if (!cancelled) {
          setSavedLanguage(saved.lang);
          setTour(saved.tour);
        }
      } else {
        const result = await backend.getTour(id);
        if (!cancelled) setTour(result);
      }
    };
    void load().catch(() => !cancelled && setTour(null));
    return () => {
      cancelled = true;
    };
  }, [backend, id, download, reload]);

  const path = useMemo(() => (tour ? tourPath(tour) : []), [tour]);
  const stops = useMemo(
    () => tour?.stops.map((stop) => ({ id: stop.poiId, location: stop.location })) ?? [],
    [tour],
  );
  const stopPois = useStopPois(stops);
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

  const planned = tour.source === 'planned';
  const premium = subscribed(ent);
  const bought = ent.entitlements.some(
    (e) => e.type === 'tour' && e.tourId === tour.id && e.source === 'credit',
  );
  const downloadAllowed = canDownloadTour(ent, {
    tourId: tour.id,
    mode: planned ? 'planned' : 'tour',
    placeId: tour.placeId,
  });
  const openPaywall = (intent?: 'download') =>
    router.push({
      pathname: '/paywall',
      params: planned
        ? {
            kind: 'session',
            tourId: tour.id,
            placeId: tour.placeId,
            mode: 'planned',
            ...(intent ? { intent } : {}),
          }
        : { kind: 'tour', tourId: tour.id, ...(intent ? { intent } : {}) },
    });

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
    if (startInFlight.current || dl.phase === 'running') return;
    if (download === '1' && !dl.complete) return;
    startInFlight.current = true;
    setStarting(true);
    setStartError(false);
    try {
      let foregroundOnly = false;
      if (!simulator && backend.kind === 'firebase') {
        const perm = await requestBackground();
        if (perm === 'denied') return setStartError('denied');
        foregroundOnly = perm === 'foreground';
      }
      const interest = planned ? tour.themes[0] : interests[0];
      await startTourSession({
        tour,
        lang: language,
        ...(download === '1' && dl.manifest ? { script: downloadedTourScript(dl.manifest) } : {}),
        ...(interest ? { interest } : {}),
        simulate: simulator,
        planned,
        ...(foregroundOnly ? { foregroundOnly } : {}),
      });
      router.replace('/play');
    } catch (error) {
      if (!(error instanceof FreeTourIntroCancelled)) setStartError('failed');
    } finally {
      startInFlight.current = false;
      setStarting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <Stack.Screen options={TOUR_HEADER} />
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
            ...(interestOf(stopPois.get(s.poiId)) ? { interest: interestOf(stopPois.get(s.poiId))! } : {}),
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
        {planned && curated === '1' ? (
          <View style={{ gap: 12 }}>
            <TuuSays pose="celebrate" size={72} text={t('curation.ready')} />
            <Text variant="subheadline">{t('curation.readyDetail')}</Text>
            {Number(adjusted) > 0 ? <Banner text={t('plan.adjusted')} /> : null}
          </View>
        ) : null}
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
                <CategoryBadge key={th} interest={th} />
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
              interest={interestOf(stopPois.get(s.poiId))}
              {...(i > 0
                ? { hint: t('tour.walkFromPrev', { minutes: Math.round(s.walkMinutesFromPrev) }) }
                : {})}
              {...(s.partner ? { value: t('common.partner') } : {})}
            />
          ))}
        </ListGroup>

        {/* one hint at a time: the offline benefit first, once downloaded what starting does */}
        {dl.complete ? (
          <TuuSays pose="walk" size={56} tipId="tour.start" text={t('tuu.tourStart')} />
        ) : (
          <TuuSays pose="present" size={56} tipId="tour.offline" text={t('tuu.tourOffline')} />
        )}
        <ListGroup
          footer={[
            t('downloads.fixedOnly'),
            t('downloads.purchaseRequired'),
            ...(!dl.mapsSupported ? [t('downloads.mapOnlineOnly')] : []),
          ].join(' ')}
        >
          {dl.phase === 'running' ? (
            <ListRow
              icon="download"
              label={t('downloads.downloading', { percent: Math.round(dl.fraction * 100) })}
              trailing={
                <Button variant="ghost" size="regular" label={t('downloads.cancel')} onPress={dl.cancel} />
              }
            />
          ) : dl.complete ? (
            <>
              <ListRow
                icon="check-circle"
                label={t(dl.manifest?.mapPack ? 'downloads.downloaded' : 'downloads.storiesDownloaded')}
                {...(!dl.manifest?.mapPack ? { hint: t('downloads.noMap') } : {})}
              />
              {!dl.manifest?.mapPack && dl.mapsSupported ? (
                <ListRow
                  icon="download"
                  label={t('downloads.repairMap')}
                  {...(!starting ? { onPress: () => void dl.repairMap() } : {})}
                />
              ) : null}
            </>
          ) : dl.supported ? (
            <ListRow
              icon="download"
              label={
                dl.partial
                  ? t('downloads.resume')
                  : `${t('downloads.download')} (${t('downloads.size', { size: formatBytes(estimateDownloadBytes(tour)) })})`
              }
              {...(!starting
                ? { onPress: () => (downloadAllowed ? void dl.start() : openPaywall('download')) }
                : {})}
            />
          ) : null}
          {bought && !planned ? (
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
            text={
              dl.error === 'no_space'
                ? t('downloads.noSpace')
                : dl.error === 'locked'
                  ? t('downloads.purchaseRequired')
                  : dl.error === 'map_failed'
                    ? t('downloads.mapFailed')
                    : t('downloads.failed')
            }
          />
        ) : null}
        {download === '1' && dl.partial ? (
          <Banner tone="warning" text={t('downloads.repairRequired')} />
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
            <PlacePhoto
              image={tour.coverImage}
              name={text?.title ?? tour.template}
              style={{ height: 160, flex: 0 }}
            />
          </View>
        ) : null}
      </ScrollView>

      <FloatingAction>
        <Row gap={8} style={{ alignItems: 'stretch' }}>
          {dl.supported && !dl.complete ? (
            <Button
              label={t('downloads.save')}
              variant="tinted"
              icon="download"
              loading={dl.phase === 'running'}
              disabled={starting}
              style={{ flex: 1 }}
              onPress={() => (downloadAllowed ? void dl.start() : openPaywall('download'))}
            />
          ) : null}
          <Button
            label={premium ? t('tour.start') : t('tour.startText')}
            icon={premium ? 'play' : 'map'}
            loading={starting}
            disabled={dl.phase === 'running' || (download === '1' && !dl.complete)}
            style={{ flex: 1 }}
            onPress={() => void start()}
          />
        </Row>
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

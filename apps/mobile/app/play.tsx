import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, FlatList, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInterstitials } from '../src/ads/useInterstitials';
import { useBackend } from '../src/backend';
import { bearingDegrees, type PublicOffer } from '@tuur/shared';
import { Feather } from '@expo/vector-icons';
import { ImageCredit } from '../src/components/ImageCredit';
import { AiBadge } from '../src/components/AiBadge';
import { Banner } from '../src/components/Banner';
import { Button, IconButton, Row } from '../src/components/Button';
import { OptionCard } from '../src/components/OptionCard';
import { ProgressBar } from '../src/components/ProgressBar';
import { Sheet } from '../src/components/Sheet';
import { Text } from '../src/components/Text';
import { TuurMap } from '../src/components/TuurMap';
import type { ForkSnapshot } from '../src/guide/modes';
import { endSession, tourPath, useActiveSession, type ActiveSession } from '../src/guide/session';
import { useSettings } from '../src/state/settings';
import { colors, radii } from '../src/theme';

const NO_FORK: ForkSnapshot = { options: [], loading: false };
const noopSubscribe = () => () => undefined;

/** Tour screen (spec 11): map on top, player sheet below (title, image carousel, red progress, transcript). */
export default function Play() {
  const session = useActiveSession();
  if (!session) return <Redirect href="/home" />;
  return <PlayInner session={session} />;
}

function PlayInner({ session }: { session: ActiveSession }) {
  const { runtime, tour, simulator, fork } = session;
  const ui = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const forkState = useSyncExternalStore(
    fork?.subscribe ?? noopSubscribe,
    fork?.getSnapshot ?? (() => NO_FORK),
    () => NO_FORK,
  );
  useInterstitials(runtime, ui);
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const lang = useSettings((s) => s.language);
  const [showText, setShowText] = useState(false);
  const [sheet, setSheet] = useState(1);
  const [reported, setReported] = useState(false);
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const sponsored = Boolean(ui.narration?.sponsored);
  const partnerPoiId = ui.narration?.kind === 'stop' ? ui.narration.poiId : undefined;
  // Partner stop: count the visit, show the offers (server only returns valid ones) and count the impression.
  useEffect(() => {
    setOffers([]);
    if (!sponsored || !partnerPoiId) return;
    let cancelled = false;
    void backend.recordPartnerEvent(partnerPoiId, 'visit');
    void backend
      .getOffers([partnerPoiId])
      .then((o) => {
        if (cancelled) return;
        setOffers(o);
        if (o.length) void backend.recordPartnerEvent(partnerPoiId, 'impression');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend, sponsored, partnerPoiId, ui.narration?.key]);
  const path = useMemo(() => (tour ? tourPath(tour) : ui.stops.map((s) => s.location)), [tour, ui.stops]);
  const text = tour ? (tour.texts[lang] ?? tour.texts['en'] ?? Object.values(tour.texts)[0]) : undefined;
  const n = ui.narration;
  const lastP = n?.paragraphs[n.paragraphs.length - 1];
  const progress =
    n && n.kind === 'stop' && lastP ? ui.positionMs / Math.max(1, lastP.startMs + lastP.durationMs) : 0;
  const modeTitle =
    session.mode === 'roam'
      ? t('roam.title')
      : session.mode === 'fork'
        ? t('fork.title')
        : (text?.title ?? '');
  const title =
    ui.phase === 'finished'
      ? t('player.finished')
      : n && ui.phase === 'narrating'
        ? n.title
        : ui.target
          ? t('player.walkingTo', { name: ui.target.name })
          : session.mode === 'roam'
            ? t('roam.exploringAhead')
            : modeTitle;

  const exit = () =>
    Alert.alert(t('player.exit'), t('player.exitConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('player.exit'),
        style: 'destructive',
        onPress: () => void endSession().then(() => router.replace('/home')),
      },
    ]);

  const report = async () => {
    if (!n) return;
    await backend.reportNarration({ narrationKey: n.key, reason: 'wrong_fact' }).catch(() => undefined);
    setReported(true);
  };

  const noticeText =
    ui.notice === 'vehicle_paused'
      ? t('player.vehiclePaused')
      : ui.notice === 'vehicle_resumed'
        ? t('player.vehicleResumed')
        : ui.notice === 'unavailable'
          ? t('player.unavailable')
          : ui.notice === 'locked'
            ? t('errors.locked')
            : ui.notice === 'generation_paused'
              ? t('errors.paused')
              : ui.notice === 'rate_limited'
                ? t('errors.rateLimited')
                : ui.notice === 'offline'
                  ? t('errors.network')
                  : undefined;

  const targetStop = ui.target ? ui.stops.find((s) => s.id === ui.target?.id) : undefined;
  const arrowDeg =
    ui.user && targetStop
      ? Math.round((bearingDegrees(ui.user, targetStop.location) - (ui.user.heading ?? 0) + 360) % 360)
      : undefined;

  const header = (
    <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
      <Text variant="title" numberOfLines={2} accessibilityRole="header" accessibilityLiveRegion="polite">
        {title}
      </Text>
      {ui.target?.distanceM !== undefined && ui.phase !== 'finished' ? (
        <View
          accessible
          accessibilityLabel={`${t('player.nextStop', { name: ui.target.name })}, ${ui.target.distanceM} m`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          {arrowDeg !== undefined ? (
            <View style={{ transform: [{ rotate: `${arrowDeg}deg` }] }} accessibilityElementsHidden>
              <Feather name="navigation" size={32} color={colors.brand.redPressed} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            {/* distance is the most useful outdoor cue: large and high-contrast */}
            <Text variant="display">
              {ui.target.distanceM >= 1000
                ? `${(ui.target.distanceM / 1000).toFixed(1).replace('.', ',')} km`
                : `${ui.target.distanceM} m`}
            </Text>
            <Text variant="bodySecondary" numberOfLines={1}>
              {t('player.nextStop', { name: ui.target.name })}
            </Text>
          </View>
        </View>
      ) : null}
      {n ? <AiBadge /> : null}
      <ProgressBar value={progress} />
      <Row gap={16} style={{ justifyContent: 'center' }}>
        <IconButton icon="skip-back" label={t('player.previous')} onPress={runtime.previous} />
        <IconButton
          icon={ui.phase === 'paused' ? 'play' : 'pause'}
          label={ui.phase === 'paused' ? t('player.play') : t('player.pause')}
          onPress={ui.phase === 'paused' ? runtime.resume : runtime.pause}
          size={72}
          primary
        />
        <IconButton icon="skip-forward" label={t('player.next')} onPress={runtime.skip} />
      </Row>
    </View>
  );

  const center = tour?.stops[0]?.location ?? ui.user ?? ui.stops[0]?.location ?? { lat: 52.52, lng: 13.405 };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <TuurMap
        center={center}
        route={path}
        user={ui.user}
        follow={Boolean(ui.user)}
        {...(ui.user ? {} : { fit: path })}
        bottomInset={360}
        stops={ui.stops.map((s, i) => ({
          id: s.id,
          location: s.location,
          number: i + 1,
          state:
            s.state === 'visited' || s.state === 'skipped'
              ? 'visited'
              : s.state === 'current'
                ? 'current'
                : 'upcoming',
          partner: tour?.stops[i]?.partner ?? false,
        }))}
      />
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <IconButton icon="x" label={t('player.exit')} onPress={exit} size={44} />
        {simulator ? (
          <Button
            variant="secondary"
            label={t('player.simulateJump')}
            onPress={() => simulator.jumpTo(simulator.progressMeters + 120)}
            style={{ minHeight: 44 }}
          />
        ) : null}
      </View>

      <Sheet
        snapPoints={[300, 470, 720]}
        index={sheet}
        onIndexChange={setSheet}
        handleLabel={t('player.transcript')}
        header={header}
      >
        <View style={{ gap: 14 }}>
          {session.foregroundOnly ? <Banner icon="smartphone" text={t('player.foregroundOnly')} /> : null}
          {noticeText ? (
            <Banner
              tone={ui.notice === 'vehicle_paused' ? 'warning' : 'info'}
              text={noticeText}
              icon={ui.notice === 'vehicle_paused' ? 'truck' : undefined}
            />
          ) : null}

          {fork && (forkState.options.length > 0 || ui.awaitingRoute) ? (
            <View style={{ gap: 10 }}>
              <Text variant="heading" accessibilityRole="header">
                {t('fork.choose')}
              </Text>
              <Text variant="caption">
                {forkState.loading ? t('fork.loadingTeasers') : t('fork.chooseHint')}
              </Text>
              {forkState.options.length === 0 ? (
                <Banner text={t('fork.none')} />
              ) : (
                <Row gap={12} style={{ alignItems: 'stretch' }}>
                  {forkState.options.map((o) => (
                    <OptionCard
                      key={o.poi.id}
                      poi={o.poi}
                      walkMinutes={o.walkMinutes}
                      teaser={o.teaser}
                      onPress={() => fork.choose(o.poi.id)}
                    />
                  ))}
                </Row>
              )}
            </View>
          ) : null}

          {session.mode === 'roam' && !n ? <Banner icon="compass" text={t('roam.hint')} /> : null}
          {ui.offerMore ? (
            <Button label={t('player.more')} icon="plus-circle" onPress={runtime.more} />
          ) : null}

          {sponsored ? (
            <View
              style={{
                gap: 8,
                padding: 12,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.brand.red,
                backgroundColor: colors.brand.redTint,
              }}
            >
              <Text variant="label" color={colors.brand.redPressed}>
                {`${t('partner.adLabel')} · ${t('partner.label')}`}
              </Text>
              <Text variant="caption">{t('partner.introNote')}</Text>
              {offers.map((o) => (
                <View key={o.id} style={{ gap: 4 }}>
                  <Text variant="heading">{o.title}</Text>
                  <Text variant="bodySecondary">{o.description}</Text>
                  {o.terms ? <Text variant="caption">{`${t('partner.terms')}: ${o.terms}`}</Text> : null}
                  <Text variant="caption">
                    {t('partner.validUntil', { date: new Date(o.validUntil).toLocaleDateString(lang) })}
                  </Text>
                  <Button
                    label={t('partner.redeem')}
                    icon="tag"
                    onPress={() => router.push({ pathname: '/redeem', params: { offerId: o.id } })}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {n && n.images.length ? (
            <View>
              <FlatList
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                data={n.images}
                keyExtractor={(i) => i.url}
                renderItem={({ item }) => (
                  <View style={{ width: width - 40, marginRight: 8 }}>
                    <Image
                      source={{ uri: item.url }}
                      style={{ height: 180, borderRadius: radii.md }}
                      contentFit="cover"
                      accessibilityIgnoresInvertColors
                      accessibilityLabel={n.title}
                    />
                    <ImageCredit image={item} style={{ marginTop: 4 }} />
                  </View>
                )}
              />
            </View>
          ) : null}

          {n ? (
            <>
              <Button
                variant="secondary"
                icon={showText ? 'chevron-up' : 'file-text'}
                label={showText ? t('player.hideTranscript') : t('player.transcript')}
                onPress={() => setShowText((v) => !v)}
              />
              {showText ? (
                <View style={{ gap: 12 }} accessibilityLabel={t('player.transcript')}>
                  {n.paragraphs.map((p, i) => (
                    <Text
                      key={i}
                      variant="body"
                      style={{
                        opacity: i === ui.paragraphIndex ? 1 : 0.6,
                        fontFamily:
                          i === ui.paragraphIndex ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_500Medium',
                      }}
                    >
                      {p.text}
                    </Text>
                  ))}
                </View>
              ) : null}
              {n.grounding?.searchEntryPointHtml ? <Text variant="caption">Google Search</Text> : null}
              <AiBadge />
              <Button
                variant="ghost"
                icon="flag"
                label={reported ? t('player.reported') : t('player.reportIssue')}
                disabled={reported}
                onPress={() => void report()}
              />
            </>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

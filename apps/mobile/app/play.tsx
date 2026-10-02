import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ScrollView } from 'react-native';
import { Alert, Animated, PixelRatio, Platform, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInterstitials } from '../src/ads/useInterstitials';
import { useBackend } from '../src/backend';
import { bearingDegrees, navigationView, type PublicOffer } from '@tuur/shared';
import { AiBadge } from '../src/components/AiBadge';
import { Banner } from '../src/components/Banner';
import { GroupBar } from '../src/components/GroupBar';
import { Icon } from '../src/components/Icon';
import { ListGroup, ListRow } from '../src/components/ListGroup';
import { Button, IconButton, Row } from '../src/components/Button';
import { Mascot } from '../src/components/Mascot';
import { OptionCard } from '../src/components/OptionCard';
import { ProgressBar } from '../src/components/ProgressBar';
import { Sheet } from '../src/components/Sheet';
import { StopCards, interestOf } from '../src/components/StopCards';
import { Transcript } from '../src/components/Transcript';
import { TravelModeChip } from '../src/components/TravelModeChip';
import { Text } from '../src/components/Text';
import { TuuSays, useTip } from '../src/components/TuuSays';
import { TuurMap } from '../src/components/TuurMap';
import type { ForkSnapshot } from '../src/guide/modes';
import { endSession, tourPath, useActiveSession, type ActiveSession } from '../src/guide/session';
import { useStopPois } from '../src/hooks/useStopPois';
import { endTourAndShowSummary, goHome, isEndingTour } from '../src/navigation';
import { haptics } from '../src/motion';
import { formatKm } from '../src/format';
import { useSettings } from '../src/state/settings';
import { colors, metrics, radii, sys } from '../src/theme';

const NO_FORK: ForkSnapshot = { options: [], loading: false };
const noopSubscribe = () => () => undefined;

/** Tour screen (spec 11): map on top, player sheet below (title, image carousel, red progress, transcript). */
export default function Play() {
  const session = useActiveSession();
  if (!session) return isEndingTour() ? null : <Redirect href="/home" />;
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
  const lang = useSettings((s) => s.language);
  const highlightWords = useSettings((s) => s.highlightWords);
  const [showText, setShowText] = useState(false);
  const sheetScroll = useRef<ScrollView>(null);
  const transcriptY = useRef(0);
  const userScrolledAt = useRef(0);
  const [sheet, setSheet] = useState(1);
  // snap heights follow the text size so the header and controls are never cut off
  const scale = Math.min(1.5, Math.max(1, PixelRatio.getFontScale()));
  const snaps = [Math.round(300 * scale), Math.round(560 * scale), 780];
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
  const pois = useStopPois(ui.stops);
  const targetIndex = ui.target ? ui.stops.findIndex((s) => s.id === ui.target?.id) : -1;
  // Navigation: walked part muted, the way from the user to the next stop prominent, the rest lighter.
  const nav = useMemo(
    () =>
      navigationView(
        path,
        ui.stops.map((s) => s.location),
        targetIndex >= 0 ? targetIndex : undefined,
        ui.user,
      ),
    [path, ui.stops, targetIndex, ui.user],
  );
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
          ? ui.target.name
          : session.mode === 'roam'
            ? t('roam.exploringAhead')
            : modeTitle;

  // Leaving the player keeps the tour running (home shows "continue"); ending it opens the summary.
  const finish = () => endTourAndShowSummary(router, endSession);
  const confirmFinish = () => {
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(t('player.exitConfirm'))) void finish();
      return;
    }
    Alert.alert(t('player.endTour'), t('player.exitConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('player.endTour'), style: 'destructive', onPress: () => void finish() },
    ]);
  };

  const report = async () => {
    if (!n) return;
    await backend.reportNarration({ narrationKey: n.key, reason: 'wrong_fact' }).catch(() => undefined);
    setReported(true);
  };

  const noticeText =
    ui.notice === 'vehicle_paused'
      ? undefined
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
  // Without a GPS heading (standing, slow walking) a relative arrow would point anywhere: hide it then.
  const arrowDeg =
    ui.user && targetStop && ui.user.heading !== undefined
      ? bearingDegrees(ui.user, targetStop.location) - ui.user.heading
      : undefined;
  const arrow = useRef(new Animated.Value(0)).current;
  const arrowAt = useRef(0);
  useEffect(() => {
    if (arrowDeg === undefined) return;
    const delta = ((arrowDeg - arrowAt.current + 540) % 360) - 180;
    arrowAt.current += delta;
    Animated.spring(arrow, {
      toValue: arrowAt.current,
      damping: 20,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  }, [arrowDeg, arrow]);
  const arrived = ui.target?.distanceM !== undefined && ui.target.distanceM < 25;
  // a short success tick on arrival, a warning when a vehicle pauses the tour
  useEffect(() => {
    if (arrived) haptics.success();
  }, [arrived, ui.target?.id]);
  useEffect(() => {
    if (ui.notice === 'vehicle_paused') haptics.warning();
  }, [ui.notice]);
  // One Tuu bubble at a time: vehicle pause > first-time controls tip > arrival > reading hint while narrating.
  const controlsTip = useTip('play.controls');
  const listenTip = useTip('play.listen');
  const vehiclePaused = ui.notice === 'vehicle_paused';
  const tuuBubble =
    ui.phase === 'finished' ? null : vehiclePaused ? (
      <TuuSays pose="relax" size={64} text={t('player.vehiclePaused')} />
    ) : controlsTip.visible ? (
      <TuuSays
        pose={n && ui.phase === 'narrating' ? 'listen' : 'present'}
        size={64}
        tipId="play.controls"
        text={t('tuu.playControls')}
      />
    ) : arrived && !(n && ui.phase === 'narrating') ? (
      <TuuSays pose="celebrate" size={64} text={t('tuu.playArrived')} />
    ) : n && ui.phase === 'narrating' && !showText && listenTip.visible ? (
      <TuuSays pose="listen" size={64} tipId="play.listen" text={t('tuu.playListen')} />
    ) : null;
  const distanceLabel =
    ui.target?.distanceM === undefined
      ? ''
      : ui.target.distanceM >= 1000
        ? `${formatKm(ui.target.distanceM, lang)} km`
        : `${ui.target.distanceM >= 100 ? Math.round(ui.target.distanceM / 10) * 10 : ui.target.distanceM} m`;

  const header = (
    <View style={{ paddingHorizontal: metrics.margin, paddingBottom: 12, gap: 12 }}>
      <Row gap={10}>
        <Text
          variant="title2"
          numberOfLines={2}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={{ flex: 1 }}
        >
          {title}
        </Text>
      </Row>
      {ui.target?.distanceM !== undefined && ui.phase !== 'finished' && !(n && ui.phase === 'narrating') ? (
        <View
          accessible
          accessibilityLabel={
            arrived ? t('cards.here') : `${t('player.nextStop', { name: ui.target.name })}, ${distanceLabel}`
          }
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          {arrived ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radii.pill,
                backgroundColor: colors.brand.redTint,
              }}
            >
              <Icon name="map-pin" size={18} color={sys.accentText} />
              <Text variant="label" color={sys.accentText}>
                {t('cards.here')}
              </Text>
            </View>
          ) : (
            <>
              {arrowDeg !== undefined ? (
                <Animated.View
                  accessibilityElementsHidden
                  style={{
                    transform: [
                      {
                        rotate: arrow.interpolate({
                          inputRange: [-360, 360],
                          outputRange: ['-360deg', '360deg'],
                          extrapolate: 'extend',
                        }),
                      },
                    ],
                  }}
                >
                  <Icon name="navigation-variant" size={32} color={sys.accentText} weight="semibold" />
                </Animated.View>
              ) : null}
              {/* distance is the most useful outdoor cue: large and high-contrast */}
              <Text variant="display">{distanceLabel}</Text>
            </>
          )}
        </View>
      ) : null}
      {n ? <AiBadge /> : null}
      <ProgressBar value={progress} />
      <Row gap={16} style={{ justifyContent: 'center' }}>
        <IconButton
          icon="skip-back"
          label={t('player.previous')}
          onPress={() => {
            haptics.tap();
            runtime.previous();
          }}
        />
        <IconButton
          icon={ui.phase === 'paused' ? 'play' : 'pause'}
          label={ui.phase === 'paused' ? t('player.play') : t('player.pause')}
          onPress={() => {
            haptics.tap();
            if (ui.phase === 'paused') runtime.resume();
            else runtime.pause();
          }}
          size={72}
          primary
        />
        <IconButton
          icon="skip-forward"
          label={t('player.next')}
          onPress={() => {
            haptics.tap();
            runtime.skip();
          }}
        />
      </Row>
    </View>
  );

  const center = ui.user ?? tour?.stops[0]?.location ?? ui.stops[0]?.location ?? { lat: 52.52, lng: 13.405 };
  // Cards follow the stop being narrated, otherwise the one the listener is walking to.
  const cardId = n?.kind === 'stop' ? n.poiId : ui.target?.id;
  const cardStop = cardId ? ui.stops.find((s) => s.id === cardId) : undefined;
  const cardPoi = cardId ? pois.get(cardId) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <TuurMap
        center={center}
        route={nav.leg.length > 1 ? nav.ahead : path}
        routeDone={nav.leg.length > 1 ? nav.done : []}
        leg={nav.leg}
        user={ui.user}
        {...(ui.user ? {} : { fit: path })}
        bottomInset={snaps[Math.min(sheet, 1)]! - 40}
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
          ...(interestOf(pois.get(s.id)) ? { interest: interestOf(pois.get(s.id))! } : {}),
        }))}
      />
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: metrics.margin,
          right: metrics.margin,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <IconButton icon="chevron-down" label={t('player.minimize')} onPress={() => goHome(router)} onMap />
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <TravelModeChip mode={ui.travelMode} />
          {simulator ? (
            <Button
              variant="secondary"
              size="regular"
              label={t('player.simulateJump')}
              onPress={() => simulator.jumpTo(simulator.progressMeters + 120)}
            />
          ) : null}
        </View>
      </View>

      <Sheet
        snapPoints={snaps}
        index={sheet}
        onIndexChange={setSheet}
        handleLabel={t('player.transcript')}
        header={header}
        scrollRef={sheetScroll}
        onUserScroll={() => (userScrolledAt.current = Date.now())}
      >
        <View style={{ gap: 14 }}>
          {ui.phase === 'finished' ? (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <Mascot pose="celebrate" size={136} />
              <Text variant="title3" align="center">
                {t('player.tuuFinished')}
              </Text>
              <Button
                label={t('summary.open')}
                icon="award"
                onPress={() => void finish()}
                style={{ alignSelf: 'stretch' }}
              />
            </View>
          ) : null}
          {tuuBubble}
          {cardStop && ui.phase !== 'finished' ? (
            <View style={{ marginHorizontal: -metrics.margin }}>
              <StopCards
                poi={cardPoi}
                name={cardStop.name}
                distanceM={cardStop.id === ui.target?.id ? ui.target.distanceM : undefined}
                keyFacts={n?.kind === 'stop' && n.poiId === cardStop.id ? n.keyFacts : undefined}
                lang={lang}
              />
            </View>
          ) : null}
          {ui.phase !== 'finished' ? <GroupBar session={session} /> : null}
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
              <Text variant="title3" accessibilityRole="header">
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
                padding: 16,
                borderRadius: metrics.radius.card,
                borderCurve: 'continuous',
                backgroundColor: sys.accentTint,
              }}
            >
              <Text variant="label" color={sys.accentText}>
                {`${t('partner.adLabel')} · ${t('partner.label')}`}
              </Text>
              <Text variant="caption">{t('partner.introNote')}</Text>
              {offers.map((o) => (
                <View key={o.id} style={{ gap: 6 }}>
                  <Text variant="headline">{o.title}</Text>
                  <Text variant="subheadline" color={sys.label}>
                    {o.description}
                  </Text>
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

          {n ? (
            <>
              <Button
                variant="secondary"
                icon={showText ? 'chevron-up' : 'file-text'}
                label={showText ? t('player.hideTranscript') : t('player.transcript')}
                onPress={() => setShowText((v) => !v)}
              />
              {showText ? (
                <View onLayout={(e) => (transcriptY.current = e.nativeEvent.layout.y)}>
                  <Transcript
                    paragraphs={n.paragraphs}
                    positionMs={ui.positionMs}
                    paragraphIndex={ui.paragraphIndex}
                    highlight={highlightWords}
                    label={t('player.transcript')}
                    onActiveParagraphY={(y) => {
                      // follow the reading, but never fight the listener's own scrolling
                      if (Date.now() - userScrolledAt.current < 5000) return;
                      sheetScroll.current?.scrollTo({
                        y: Math.max(0, transcriptY.current + y - 80),
                        animated: true,
                      });
                    }}
                  />
                </View>
              ) : null}
              {n.grounding?.searchEntryPointHtml ? <Text variant="caption">Google Search</Text> : null}
            </>
          ) : null}
          <ListGroup>
            {n ? (
              <ListRow
                icon="flag"
                label={reported ? t('player.reported') : t('player.reportIssue')}
                onPress={reported ? undefined : () => void report()}
              />
            ) : null}
            {ui.phase !== 'finished' ? (
              <ListRow icon="x" label={t('player.endTour')} destructive onPress={confirmFinish} />
            ) : null}
          </ListGroup>
        </View>
      </Sheet>
    </View>
  );
}

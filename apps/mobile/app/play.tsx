import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { ScrollView } from 'react-native';
import { Alert, Animated, PixelRatio, Platform, View, useWindowDimensions } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInterstitials } from '../src/ads/useInterstitials';
import { useBackend } from '../src/backend';
import type { PublicOffer } from '@tuur/shared';
import { Banner } from '../src/components/Banner';
import { NavigationRouteNotice } from '../src/components/navigation-route-notice';
import { useNavigationRoute } from '../src/guide/use-navigation-route';
import { GroupBar } from '../src/components/GroupBar';
import { Icon } from '../src/components/Icon';
import { Button, IconButton, Row } from '../src/components/Button';
import { MapActionControls } from '../src/components/MapActionControls';
import { PauseFinder } from '../src/components/PauseFinder';
import { Mascot } from '../src/components/Mascot';
import { OptionCard } from '../src/components/OptionCard';
import { OptionCards } from '../src/components/OptionCards';
import { ProgressBar } from '../src/components/ProgressBar';
import { RoamSuggestions } from '../src/components/roam-suggestions';
import { StopInfoSheet } from '../src/components/stop-info-sheet';
import { Sheet } from '../src/components/Sheet';
import { StopCards, interestOf } from '../src/components/StopCards';
import { CategoryBadge } from '../src/components/category-badge';
import { Transcript } from '../src/components/Transcript';
import { TravelModeChip } from '../src/components/TravelModeChip';
import { Text } from '../src/components/Text';
import { TuuSays, useTip } from '../src/components/TuuSays';
import { TuurMap } from '../src/components/TuurMap';
import type { ForkSnapshot } from '../src/guide/modes';
import {
  endSession,
  switchSessionToExplore,
  tourPath,
  useActiveSession,
  type ActiveSession,
} from '../src/guide/session';
import { canUseSession, useEntitlementStore } from '../src/billing/entitlements';
import { useStopPois } from '../src/hooks/useStopPois';
import { useRoamSuggestions } from '../src/hooks/use-roam-suggestions';
import { endTourAndShowSummary, goHome, isEndingTour } from '../src/navigation';
import { haptics } from '../src/motion';
import { formatKm } from '../src/format';
import { useSettings } from '../src/state/settings';
import { useHistory } from '../src/state/history';
import { colors, metrics, radii, sys } from '../src/theme';

const NO_FORK: ForkSnapshot = { options: [], loading: false };
const noopSubscribe = () => () => undefined;

/** Tour screen: compact playback header above the stop photos, secondary controls and transcript. */
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
  const { height: screenH } = useWindowDimensions();
  const entitlements = useEntitlementStore();
  const walked = useHistory((s) => s.records.find((r) => r.id === session.recordId)?.track);
  const savedStops = useHistory((s) => s.records.find((r) => r.id === session.recordId)?.stops);
  const settingsLanguage = useSettings((s) => s.language);
  const lang = session.recovery?.lang ?? settingsLanguage;
  const highlightWords = useSettings((s) => s.highlightWords);
  const [showText, setShowText] = useState(false);
  const sheetScroll = useRef<ScrollView>(null);
  const transcriptY = useRef(0);
  const userScrolledAt = useRef(0);
  const [sheet, setSheet] = useState(1);
  const [selectedStopId, setSelectedStopId] = useState<string>();
  const [readingStopId, setReadingStopId] = useState<string>();
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string>();
  const [suggestionSelectionKey, selectSuggestion] = useReducer((key: number) => key + 1, 0);
  const suggestions = useRoamSuggestions(session, ui);
  const [recenterKey, recenterMap] = useReducer((key: number) => key + 1, 0);
  const [pauseFinderOpen, setPauseFinderOpen] = useState(false);
  // snap heights follow the text size so the header and controls are never cut off
  const scale = Math.min(1.5, Math.max(1, PixelRatio.getFontScale()));
  const snaps = [
    Math.round(180 * scale) + insets.bottom,
    Math.min(screenH * 0.68, 560 * scale),
    screenH * 0.92,
  ];
  const [reported, setReported] = useState(false);
  const [mapSheetHeight, setMapSheetHeight] = useState(snaps[1]!);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState(false);
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
  const path = useMemo(() => (tour ? tourPath(tour) : []), [tour]);
  const storyStops = useMemo(() => ui.stops.filter((stop) => !stop.navigationOnly), [ui.stops]);
  const pois = useStopPois(storyStops);
  const nav = useNavigationRoute(session);
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
            ? 'Tuu'
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
    if (!n || reporting) return;
    setReporting(true);
    setReportError(false);
    try {
      await backend.reportNarration({ narrationKey: n.key, reason: 'wrong_fact' });
      setReported(true);
    } catch {
      setReportError(true);
    } finally {
      setReporting(false);
    }
  };
  useEffect(() => {
    setReported(false);
    setReportError(false);
  }, [n?.key]);
  const exploreInstead = () => {
    if (!canUseSession(entitlements, 'roam', tour?.placeId)) {
      if (tour?.placeId)
        router.push({
          pathname: '/paywall',
          params: { kind: 'session', placeId: tour.placeId, mode: 'roam' },
        });
      return;
    }
    if (switchSessionToExplore()) haptics.select();
  };

  const noticeText =
    ui.notice === 'unavailable'
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

  // Without a GPS heading (standing, slow walking) a relative arrow would point anywhere: hide it then.
  const arrowDeg =
    nav.bearing !== undefined && ui.user?.heading !== undefined ? nav.bearing - ui.user.heading : undefined;
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
  // A short success tick on arrival.
  useEffect(() => {
    if (arrived) haptics.success();
  }, [arrived, ui.target?.id]);
  // One Tuu bubble at a time: first-time controls tip > arrival > reading hint while narrating.
  const controlsTip = useTip('play.controls');
  const listenTip = useTip('play.listen');
  const tuuBubble =
    ui.phase === 'finished' ? null : controlsTip.visible ? (
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
    nav.distanceM === undefined
      ? ''
      : nav.distanceM >= 1000
        ? `${formatKm(nav.distanceM, lang)} km`
        : `${nav.distanceM >= 100 ? Math.round(nav.distanceM / 10) * 10 : nav.distanceM} m`;
  const distanceDescription = t('player.routeDistance', { distance: distanceLabel });
  const headerPoiId = n?.kind === 'stop' ? n.poiId : ui.target?.id;
  const headerInterest = headerPoiId ? interestOf(pois.get(headerPoiId)) : undefined;

  const header = (
    <View style={{ paddingHorizontal: metrics.margin, paddingBottom: 12, gap: 8 }}>
      <Row gap={12}>
        <Text
          variant="title2"
          numberOfLines={2}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={{ flex: 1, minWidth: 0 }}
        >
          {title}
        </Text>
        <IconButton
          icon={ui.phase === 'paused' ? 'play' : 'pause'}
          label={ui.phase === 'paused' ? t('player.play') : t('player.pause')}
          onPress={() => {
            haptics.tap();
            if (ui.phase === 'paused') runtime.resume();
            else runtime.pause();
          }}
          size={56}
          primary
        />
      </Row>
      {headerInterest && ui.phase !== 'finished' ? <CategoryBadge interest={headerInterest} /> : null}
      {ui.target &&
      (nav.distanceM !== undefined || arrived) &&
      ui.phase !== 'finished' &&
      !(n && ui.phase === 'narrating') ? (
        <View
          accessible
          accessibilityLabel={
            arrived
              ? t('cards.here')
              : `${t('player.nextStop', { name: ui.target.name })}, ${distanceDescription}`
          }
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
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
                  <Icon name="navigation-variant" size={24} color={sys.accentText} weight="semibold" />
                </Animated.View>
              ) : null}
              <Text variant="title3" style={{ flexShrink: 1 }}>
                {distanceDescription}
              </Text>
            </>
          )}
        </View>
      ) : null}
      <NavigationRouteNotice navigation={nav} onRetry={session.navigation?.retry} />
      <ProgressBar value={progress} />
    </View>
  );

  const center = ui.user ?? tour?.stops[0]?.location ?? ui.stops[0]?.location ?? { lat: 52.52, lng: 13.405 };
  // Cards follow the stop being narrated, otherwise the one the listener is walking to.
  const inspectedStop = storyStops.find((stop) => stop.id === selectedStopId);
  const cardId = inspectedStop?.id ?? (n?.kind === 'stop' ? n.poiId : ui.target?.id);
  const cardStop = cardId ? storyStops.find((s) => s.id === cardId) : undefined;
  const cardPoi = cardId ? pois.get(cardId) : undefined;
  const readingStop =
    savedStops?.find((stop) => stop.id === readingStopId) ??
    storyStops.find((stop) => stop.id === readingStopId);
  const savedNarration = readingStop ? runtime.getStopNarration(readingStop.id) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <TuurMap
        center={center}
        route={ui.target ? nav.ahead : []}
        routeDone={walked ?? []}
        leg={nav.leg}
        followUser={ui.phase !== 'finished'}
        showRouteLegend
        user={ui.user}
        {...(ui.user ? {} : { fit: path })}
        bottomInset={mapSheetHeight}
        locateButton={false}
        recenterKey={recenterKey}
        onMapPress={() => setSheet(0)}
        spots={suggestions.spots}
        onSpotPress={(id) => {
          setSelectedStopId(undefined);
          setSelectedSuggestionId(id);
          setShowText(false);
          selectSuggestion();
          setSheet(1);
          sheetScroll.current?.scrollTo({ y: 0, animated: false });
        }}
        onStopPress={(id) => {
          const stop = storyStops.find((stop) => stop.id === id);
          if (!stop) return;
          if (stop.state === 'visited' || savedStops?.some((saved) => saved.id === id)) {
            setReadingStopId(id);
            return;
          }
          setSelectedStopId(id);
          setSheet(1);
          sheetScroll.current?.scrollTo({ y: 0, animated: false });
        }}
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
        <View style={{ alignItems: 'flex-end', gap: 8, maxWidth: '80%' }}>
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
        onVisibleHeightChange={setMapSheetHeight}
        onCollapse={recenterMap}
        handleLabel={t(sheet === 2 ? 'sheet.collapse' : 'sheet.expand')}
        header={header}
        decoration={<Mascot pose="map" size={100} entrance={false} />}
        floatingAction={
          ui.user ? (
            <MapActionControls
              onLocate={recenterMap}
              onFindPause={() => setPauseFinderOpen(true)}
              tourPaused={ui.phase === 'paused'}
              onToggleTourPause={
                ui.phase === 'finished'
                  ? undefined
                  : () => (ui.phase === 'paused' ? runtime.resume() : runtime.pause())
              }
            />
          ) : null
        }
        bottomInset={insets.bottom}
        scrollRef={sheetScroll}
        onUserScroll={() => (userScrolledAt.current = Date.now())}
      >
        <View style={{ gap: 14 }}>
          {session.mode === 'roam' && ui.phase !== 'finished' && !inspectedStop ? (
            <RoamSuggestions
              suggestions={suggestions}
              position={ui.user}
              selectedId={selectedSuggestionId}
              selectionKey={suggestionSelectionKey}
              onChoose={(poi) => {
                if (session.roam?.choose(poi)) {
                  setSelectedSuggestionId(undefined);
                  setSelectedStopId(undefined);
                  haptics.select();
                }
              }}
            />
          ) : null}
          {inspectedStop ? (
            <View style={{ alignItems: 'flex-end' }}>
              <IconButton
                icon="x"
                label={t('player.closePlace')}
                onPress={() => setSelectedStopId(undefined)}
              />
            </View>
          ) : null}
          {cardStop && (ui.phase !== 'finished' || inspectedStop) ? (
            <View style={{ marginHorizontal: -metrics.margin }}>
              <StopCards
                poi={cardPoi}
                name={cardStop.name}
                distanceM={cardStop.id === ui.target?.id ? nav.distanceM : undefined}
                keyFacts={n?.kind === 'stop' && n.poiId === cardStop.id ? n.keyFacts : undefined}
                images={n?.kind === 'stop' && n.poiId === cardStop.id ? n.images : undefined}
                lang={lang}
              />
            </View>
          ) : null}
          <Row gap={32} style={{ justifyContent: 'center' }}>
            <IconButton
              icon="skip-back"
              label={t('player.previous')}
              onPress={() => {
                haptics.tap();
                runtime.previous();
              }}
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
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {ui.phase !== 'finished' ? (
              <Button
                variant="ghost"
                size="regular"
                icon="x"
                label={t('player.endTour')}
                onPress={confirmFinish}
                style={{ flex: 1 }}
              />
            ) : null}
            {n ? (
              <Button
                variant="ghost"
                size="regular"
                icon="flag"
                label={reported ? t('player.reported') : t('player.reportIssue')}
                disabled={reported}
                loading={reporting}
                onPress={() => void report()}
                style={{ flex: 1 }}
              />
            ) : null}
          </Row>
          {reportError ? <Banner tone="error" text={t('player.reportFailed')} /> : null}
          {session.mode === 'planned' && !session.groupId && !session.guest && ui.phase !== 'finished' ? (
            <View style={{ gap: 8 }}>
              <Button
                variant="tinted"
                icon="compass"
                label={t('player.exploreInstead')}
                onPress={exploreInstead}
              />
              <Text variant="footnote">{t('player.exploreHint')}</Text>
            </View>
          ) : null}
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
          {ui.phase !== 'finished' ? <GroupBar session={session} /> : null}
          {session.foregroundOnly ? <Banner icon="smartphone" text={t('player.foregroundOnly')} /> : null}
          {noticeText ? <Banner text={noticeText} /> : null}
          {ui.travelMode === 'vehicle' ? <Banner icon="car" text={t('travel.vehicleHint')} /> : null}

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
                <OptionCards>
                  {forkState.options.map((o) => (
                    <OptionCard
                      key={o.poi.id}
                      poi={o.poi}
                      walkMinutes={o.walkMinutes}
                      teaser={o.teaser}
                      onPress={() => fork.choose(o.poi.id)}
                    />
                  ))}
                </OptionCards>
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
        </View>
      </Sheet>
      <StopInfoSheet
        stop={
          readingStop
            ? { ...readingStop, ...(savedNarration ? { narration: savedNarration } : {}) }
            : undefined
        }
        poi={readingStop ? pois.get(readingStop.id) : undefined}
        onDismiss={() => setReadingStopId(undefined)}
      />
      <PauseFinder
        open={pauseFinderOpen}
        onClose={() => setPauseFinderOpen(false)}
        position={ui.user}
        runtime={ui.phase === 'finished' ? undefined : runtime}
      />
    </View>
  );
}

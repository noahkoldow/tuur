import { useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { PixelRatio, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationView, REGION_FIXTURES } from '@tuur/shared';
import type { ForkSnapshot } from '../guide/modes';
import { nearbyRoamPlaces } from '../guide/nearbyPlaces';
import { tourPath, type ActiveSession } from '../guide/session';
import { usePoiPool } from '../hooks/usePoiPool';
import { useStopPois } from '../hooks/useStopPois';
import { useHistory } from '../state/history';
import { useSettings } from '../state/settings';
import { metrics, sys } from '../theme';
import { Banner } from './Banner';
import { WordmarkPill } from './Brand';
import { Button, IconButton } from './Button';
import { MapActionControls } from './MapActionControls';
import { PauseFinder } from './PauseFinder';
import { Mascot } from './Mascot';
import { OptionCard } from './OptionCard';
import { PlaceCardSkeleton } from './PlaceCard';
import { PlacesCarousel } from './PlacesCarousel';
import { ProgressBar } from './ProgressBar';
import { RunningTour } from './RunningTour';
import { Sheet } from './Sheet';
import { StopCards, interestOf } from './StopCards';
import { CategoryBadge } from './category-badge';
import { Text } from './Text';
import { TravelModeChip } from './TravelModeChip';
import { TuurMap } from './TuurMap';

const NO_FORK: ForkSnapshot = { options: [], loading: false };
const noopSubscribe = () => () => undefined;
const noForkSnapshot = () => NO_FORK;

/** The home screen belongs to the running activity until it is explicitly ended. */
export function ActiveHome({ session }: { session: ActiveSession }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { runtime, fork } = session;
  const interests = useSettings((s) => s.interests);
  const lang = useSettings((s) => s.language);
  const walked = useHistory((s) => s.records.find((record) => record.id === session.recordId)?.track);
  const ui = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const forkState = useSyncExternalStore(
    fork?.subscribe ?? noopSubscribe,
    fork?.getSnapshot ?? noForkSnapshot,
    noForkSnapshot,
  );
  const roaming = session.mode === 'roam';
  const finished = ui.phase === 'finished';
  const { pois, count, ready, error, reload } = usePoiPool(
    roaming && !finished ? (ui.user ?? null) : null,
    2,
  );
  const state = runtime.getState();
  const places = useMemo(
    () =>
      roaming && ui.user && !finished && count > 0
        ? nearbyRoamPlaces(
            ui.user,
            pois,
            [
              ...state.visited,
              ...state.skipped,
              ...state.narrated,
              // Current and explicitly queued destinations already belong to the walk.
              ...state.route.slice(state.index).map((stop) => stop.id),
            ],
            8,
            { interests, excludedPlaces: state.route },
          )
        : [],
    [
      roaming,
      ui.user,
      finished,
      count,
      pois,
      state.visited,
      state.skipped,
      state.narrated,
      state.route,
      state.index,
      interests,
    ],
  );
  const canChoose = session.roam?.canChoose() ?? false;
  const choosingFork = !finished && (forkState.options.length > 0 || ui.awaitingRoute) && !!fork;
  const storyStops = ui.stops.filter((stop) => !stop.navigationOnly);
  const stopPois = useStopPois(storyStops);
  const [selectedStopId, setSelectedStopId] = useState<string>();
  const selectedStop = storyStops.find((stop) => stop.id === selectedStopId);
  const sheetScroll = useRef<ScrollView>(null);
  const completed = storyStops.filter((stop) => stop.state === 'visited' || stop.state === 'skipped').length;
  const visited = storyStops.filter((stop) => stop.state === 'visited').length;
  const remaining = ui.stops.filter((stop) => stop.state === 'current' || stop.state === 'upcoming');
  const path = useMemo(
    () => (session.tour ? tourPath(session.tour) : ui.stops.map((stop) => stop.location)),
    [session.tour, ui.stops],
  );
  const targetIndex = ui.awaitingRoute ? -1 : ui.stops.findIndex((stop) => stop.id === ui.target?.id);
  const nav = useMemo(
    () =>
      navigationView(
        path,
        ui.stops.map((stop) => stop.location),
        targetIndex < 0 ? undefined : targetIndex,
        ui.user,
      ),
    [path, ui.stops, targetIndex, ui.user],
  );
  const [sheetIndex, setSheetIndex] = useState(1);
  const [recenterKey, recenterMap] = useReducer((key: number) => key + 1, 0);
  const [pauseFinderOpen, setPauseFinderOpen] = useState(false);
  const scale = Math.min(2, Math.max(1, PixelRatio.getFontScale()));
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 83 : 0);
  const expanded = height * 0.92;
  const peek = Math.min(expanded, Math.round(182 * scale) + bottomPad);
  const medium = Math.min(expanded, Math.max(peek, height * 0.66));
  const [mapSheetHeight, setMapSheetHeight] = useState(medium);
  const title = finished
    ? t('player.finished')
    : roaming
      ? t('home.roamNearby')
      : choosingFork
        ? t('fork.choose')
        : t(session.mode === 'fork' ? 'fork.title' : 'home.activeRoute');
  const status =
    ui.phase === 'paused'
      ? t('home.activityPaused')
      : finished
        ? t('home.activityFinished')
        : roaming
          ? t('home.roamNearbyHint')
          : choosingFork
            ? t('fork.chooseHint')
            : t('home.routeProgress', { count: completed, total: storyStops.length });

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <TuurMap
        center={ui.user ?? ui.stops[0]?.location ?? REGION_FIXTURES[0]!.center}
        user={ui.user}
        route={nav.ahead}
        routeDone={walked ?? []}
        leg={finished ? [] : nav.leg}
        followUser={!finished}
        showRouteLegend
        stops={ui.stops.map((stop, index) => ({
          id: stop.id,
          location: stop.location,
          number: index + 1,
          state: stop.state === 'skipped' ? 'visited' : stop.state,
          ...(interestOf(stopPois.get(stop.id)) ? { interest: interestOf(stopPois.get(stop.id))! } : {}),
        }))}
        bottomInset={mapSheetHeight}
        locateButton={false}
        recenterKey={recenterKey}
        onMapPress={() => setSheetIndex(0)}
        onStopPress={(id) => {
          if (!storyStops.some((stop) => stop.id === id)) return;
          setSelectedStopId(id);
          setSheetIndex(1);
          sheetScroll.current?.scrollTo({ y: 0, animated: false });
        }}
      />
      <View style={{ position: 'absolute', top: insets.top + 8, left: metrics.margin }}>
        <WordmarkPill />
      </View>
      <View style={{ position: 'absolute', top: insets.top + 8, right: metrics.margin }}>
        <IconButton
          onMap
          icon="settings"
          label={t('common.settings')}
          onPress={() => router.push('/profile/settings')}
        />
      </View>
      <Sheet
        snapPoints={[peek, medium, expanded]}
        index={sheetIndex}
        scrollRef={sheetScroll}
        onIndexChange={setSheetIndex}
        onVisibleHeightChange={setMapSheetHeight}
        onCollapse={recenterMap}
        bottomInset={bottomPad}
        handleLabel={t(sheetIndex === 2 ? 'sheet.collapse' : 'sheet.expand')}
        decoration={<Mascot pose={ui.phase === 'paused' ? 'relax' : 'map'} size={100} entrance={false} />}
        floatingAction={
          ui.user ? (
            <MapActionControls
              onLocate={recenterMap}
              onFindPause={() => setPauseFinderOpen(true)}
              tourPaused={ui.phase === 'paused'}
              onToggleTourPause={
                finished ? undefined : () => (ui.phase === 'paused' ? runtime.resume() : runtime.pause())
              }
            />
          ) : null
        }
        header={
          <View style={{ paddingHorizontal: metrics.margin, paddingBottom: 12, gap: 12 }}>
            {!finished ? <RunningTour /> : null}
            <View style={{ gap: 4, paddingRight: 90 }}>
              <Text variant="title3" accessibilityRole="header">
                {title}
              </Text>
              <Text variant="subheadline">{status}</Text>
            </View>
          </View>
        }
      >
        <View style={{ gap: 20, paddingTop: 4 }}>
          <View style={{ alignSelf: 'flex-start' }}>
            <TravelModeChip mode={ui.travelMode} />
          </View>
          {ui.travelMode === 'vehicle' ? <Text variant="footnote">{t('travel.vehicleHint')}</Text> : null}
          {selectedStop ? (
            <View style={{ gap: 4 }}>
              <View style={{ alignItems: 'flex-end' }}>
                <IconButton
                  icon="x"
                  label={t('player.closePlace')}
                  onPress={() => setSelectedStopId(undefined)}
                />
              </View>
              <View style={{ marginHorizontal: -metrics.margin }}>
                <StopCards
                  poi={stopPois.get(selectedStop.id)}
                  name={selectedStop.name}
                  lang={lang}
                  distanceM={selectedStop.id === ui.target?.id ? ui.target.distanceM : undefined}
                  images={
                    ui.narration?.kind === 'stop' && ui.narration.poiId === selectedStop.id
                      ? ui.narration.images
                      : undefined
                  }
                />
              </View>
            </View>
          ) : null}
          {roaming && !finished ? (
            <View style={{ gap: 12 }}>
              {!ui.user ? <Text variant="subheadline">{t('home.waitingForLocation')}</Text> : null}
              {error ? (
                <View style={{ gap: 8 }}>
                  <Banner tone="error" text={t('errors.network')} />
                  <Button variant="tinted" label={t('common.retry')} onPress={reload} />
                </View>
              ) : null}
              {places.length > 0 ? (
                <>
                  {!canChoose ? <Text variant="footnote">{t('home.roamAfterStory')}</Text> : null}
                  <View style={{ marginHorizontal: -metrics.margin }}>
                    <PlacesCarousel
                      places={places}
                      position={ui.user}
                      navigate
                      disabled={!canChoose}
                      onPlacePress={(poi) => {
                        if (session.roam?.choose(poi)) router.push('/play');
                      }}
                    />
                  </View>
                </>
              ) : ui.user && ready && !error ? (
                <Text variant="subheadline">{t('home.roamNoPlaces')}</Text>
              ) : ui.user && !error ? (
                <ScrollView
                  horizontal
                  scrollEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  accessibilityLabel={t('home.loadingPlaces')}
                  style={{ marginHorizontal: -metrics.margin }}
                  contentContainerStyle={{ gap: 12, paddingHorizontal: metrics.margin }}
                >
                  {[0, 1, 2].map((i) => (
                    <PlaceCardSkeleton key={i} />
                  ))}
                </ScrollView>
              ) : null}
              <Text variant="footnote">{t('home.visitedStops', { count: visited })}</Text>
            </View>
          ) : choosingFork ? (
            <View style={{ gap: 12 }}>
              {forkState.options.length ? (
                forkState.options.map((option) => (
                  <OptionCard
                    key={option.poi.id}
                    poi={option.poi}
                    walkMinutes={option.walkMinutes}
                    teaser={option.teaser}
                    onPress={() => {
                      fork.choose(option.poi.id);
                      router.push('/play');
                    }}
                  />
                ))
              ) : (
                <Text variant="subheadline">
                  {t(forkState.loading ? 'fork.loadingTeasers' : 'fork.none')}
                </Text>
              )}
            </View>
          ) : !finished ? (
            <View style={{ gap: 12 }}>
              {session.tour ? <ProgressBar value={completed / Math.max(1, storyStops.length)} /> : null}
              {remaining.slice(0, 3).map((stop, index) => {
                const interest = interestOf(stopPois.get(stop.id));
                return (
                  <View key={stop.id} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Text variant="footnote">{t(index === 0 ? 'home.nextStop' : 'home.thenStop')}</Text>
                      {interest ? <CategoryBadge interest={interest} /> : null}
                    </View>
                    <Text variant="headline">{stop.name}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          <Button
            variant="tinted"
            icon={finished ? 'award' : 'headphones'}
            label={t(finished ? 'summary.open' : 'home.openActivity')}
            onPress={() => router.push('/play')}
          />
        </View>
      </Sheet>
      <PauseFinder
        open={pauseFinderOpen}
        onClose={() => setPauseFinderOpen(false)}
        position={ui.user}
        runtime={finished ? undefined : runtime}
      />
    </View>
  );
}

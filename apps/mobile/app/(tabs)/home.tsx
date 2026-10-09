import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, Linking, PixelRatio, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REGION_FIXTURES, rankRoamStarts, spotScale, tilesAround, type ExploredSpot } from '@tuur/shared';
import { useBackend } from '../../src/backend';
import { isApplePlacesAvailable } from '../../modules/tuur-apple-places';
import { AppleNearbyFallback } from '../../src/components/apple-nearby-fallback';
import { Banner } from '../../src/components/Banner';
import { shouldOfferAppleFallback } from '../../src/guide/apple-pause-places';
import { ActiveHome } from '../../src/components/ActiveHome';
import { WordmarkPill } from '../../src/components/Brand';
import { Button, IconButton } from '../../src/components/Button';
import { ListGroup, ListRow } from '../../src/components/ListGroup';
import { MapActionControls } from '../../src/components/MapActionControls';
import { PauseFinder } from '../../src/components/PauseFinder';
import { Mascot } from '../../src/components/Mascot';
import { PlaceCardSkeleton } from '../../src/components/PlaceCard';
import { PlacesCarousel } from '../../src/components/PlacesCarousel';
import { ResumeSessionCard } from '../../src/components/ResumeSessionCard';
import { Sheet } from '../../src/components/Sheet';
import { Text } from '../../src/components/Text';
import { TuurMap } from '../../src/components/TuurMap';
import { usePoiPool } from '../../src/hooks/usePoiPool';
import { useSelectedPlace } from '../../src/hooks/useSelectedPlace';
import { useActiveSession } from '../../src/guide/session';
import { useArea } from '../../src/location/useArea';
import { areaErrorKeys } from '../../src/location/areaErrors';
import { usePosition } from '../../src/location/usePosition';
import { useSettings } from '../../src/state/settings';
import { metrics, sys } from '../../src/theme';

const PEEK = 104;

export default function Home() {
  const session = useActiveSession();
  const router = useRouter();
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  return session ? (
    <ActiveHome key={session.recordId} session={session} />
  ) : (
    <ExploreHome
      onResumed={() => {
        if (focused.current) router.push('/play');
      }}
    />
  );
}

/**
 * Explore tab (spec 11, D40/D42): the map is the content, everything else floats above it. A nonmodal bottom sheet
 * holds what tuur found nearby and the three ways to start (roam first, the easiest). Pulling it down leaves the
 * map to the places other listeners explored, bigger when popular, a flame when hot.
 */
function ExploreHome({ onResumed }: { onResumed: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const backend = useBackend();
  const { position, permission, request } = usePosition();
  const area = useArea(position, { tours: false, ensure: false });
  const center = position ?? REGION_FIXTURES[0]!.center;
  const interests = useSettings((s) => s.interests);
  // Fixtures are useful in the demo; live discovery needs the listener's actual location.
  const discoveryPosition = position ?? (backend.kind === 'demo' ? center : null);
  const hasDiscoveryPosition = discoveryPosition !== null;
  const {
    pois,
    ready: poolReady,
    error: poolError,
    errorCode: poolErrorCode,
    reload: reloadPlaces,
  } = usePoiPool(discoveryPosition, 2);
  const discoveryError = poolErrorCode ?? (area.phase === 'failed' ? (area.errorCode ?? 'temporary') : null);
  // the best places to start nearby: what makes the app understandable at a glance
  const places = useMemo(
    () => (discoveryPosition ? rankRoamStarts(discoveryPosition, pois, interests, 8) : []),
    [discoveryPosition, pois, interests],
  );
  const [sheetIndex, setSheetIndex] = useState(1);
  const [recenterKey, recenterMap] = useReducer((key: number) => key + 1, 0);
  const [pauseFinderOpen, setPauseFinderOpen] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!hasDiscoveryPosition || poolReady) return setSlow(false);
    const id = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(id);
  }, [hasDiscoveryPosition, poolReady]);
  const [spots, setSpots] = useState<ExploredSpot[]>([]);
  const [selected, setSelected] = useState<ExploredSpot | undefined>();
  const [selectionKey, selectAgain] = useReducer((key: number) => key + 1, 0);
  const sheetScroll = useRef<ScrollView>(null);
  const selection = useSelectedPlace(selected, pois);
  const displayedPlaces = useMemo(
    () => (selection.poi ? [selection.poi, ...places.filter((poi) => poi.id !== selection.poi!.id)] : places),
    [selection.poi, places],
  );

  // the peek height follows the text size so the header is never cut off at large Dynamic Type sizes
  // the tab bar sits at the bottom edge: the inset normally includes it, the floor covers setups where it does not
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 83 : 0);
  const peek = Math.round(PEEK * Math.min(2, Math.max(1, PixelRatio.getFontScale()))) + bottomPad;
  const medium = Math.min(screenH * 0.74, Math.max(440, screenH * 0.66));
  const expanded = screenH * 0.92;
  const [mapSheetHeight, setMapSheetHeight] = useState(medium);

  // Explored spots of the surrounding tiles (loaded once the area exists; only tile ids leave the device).
  const tile = area.tile;
  const ready = area.phase === 'ready' || area.phase === 'low_content';
  useEffect(() => {
    if (!tile || !ready) return;
    let cancelled = false;
    void backend
      .getExploredSpots(tilesAround(tile, 1))
      .then((s) => !cancelled && setSpots(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend, tile, ready]);
  const maxExplorers = Math.max(0, ...spots.map((s) => s.explorers));
  const mapSpots = useMemo(
    () =>
      spots.map((s) => ({
        id: s.poiId,
        name: s.name,
        location: s.location,
        ...(s.interest ? { interest: s.interest } : {}),
        scale: spotScale(s.explorers, maxExplorers),
        hot: s.hot,
      })),
    [spots, maxExplorers],
  );

  // a card needs the position: ask for it in context, then continue with the tapped place without a second tap
  const openPlace = async (id: string) => {
    if (!position && (await request()) === 'denied') {
      // iOS shows the system prompt only once: point to the settings instead of failing silently
      Alert.alert(t('permissions.locationDenied'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.location'), onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    router.push({ pathname: '/roam', params: { start: id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <TuurMap
        center={center}
        zoom={15}
        user={position ?? undefined}
        bottomInset={mapSheetHeight}
        locateButton={false}
        recenterKey={recenterKey}
        spots={mapSpots}
        onSpotPress={(id) => {
          setSelected(spots.find((spot) => spot.poiId === id));
          selectAgain();
          setSheetIndex(1);
          sheetScroll.current?.scrollTo({ y: 0, animated: false });
        }}
        onMapPress={() => setSheetIndex(0)}
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
        bottomInset={bottomPad}
        decoration={<Mascot pose="map" size={100} entrance={false} />}
        floatingAction={
          position ? (
            <MapActionControls onLocate={recenterMap} onFindPause={() => setPauseFinderOpen(true)} />
          ) : null
        }
        floatingActionOffset={72}
        index={sheetIndex}
        scrollRef={sheetScroll}
        onVisibleHeightChange={setMapSheetHeight}
        onCollapse={recenterMap}
        onIndexChange={setSheetIndex}
        handleLabel={t(sheetIndex === 2 ? 'sheet.collapse' : 'sheet.expand')}
        header={
          <View style={{ paddingHorizontal: metrics.margin, paddingBottom: 12 }}>
            <Button
              label={t('home.roamCta')}
              icon="compass"
              onPress={() => router.push('/roam')}
              accessibilityHint={t('home.roamBody')}
            />
          </View>
        }
      >
        <View style={{ gap: 24, paddingTop: 4 }}>
          {selected && selection.poi ? (
            <View style={{ marginHorizontal: -metrics.margin }}>
              <PlacesCarousel
                places={displayedPlaces}
                selectedId={selected.poiId}
                selectionKey={selectionKey}
                position={position}
                navigate
                onNavigate={(poi) => void openPlace(poi.id)}
              />
            </View>
          ) : null}
          {selected && !selection.poi ? (
            <View style={{ gap: 8 }}>
              <Text variant="headline">{selected.name}</Text>
              {selection.status === 'loading' ? (
                <PlaceCardSkeleton />
              ) : (
                <>
                  <Banner
                    tone={selection.status === 'error' ? 'error' : 'info'}
                    text={t(
                      selection.status === 'error' ? 'errors.network' : 'home.selectedPlaceUnavailable',
                    )}
                  />
                  <Button variant="tinted" label={t('common.retry')} onPress={selection.retry} />
                </>
              )}
            </View>
          ) : null}
          <ResumeSessionCard onResumed={onResumed} />
          {area.phase === 'no-location' ? (
            <Button
              variant="tinted"
              icon="map-pin"
              label={t(permission === 'denied' ? 'common.settings' : 'home.enableLocation')}
              onPress={() => void (permission === 'denied' ? Linking.openSettings() : request())}
            />
          ) : null}
          {discoveryError ? (
            <View style={{ gap: 12 }}>
              <Banner
                tone={displayedPlaces.length ? 'warning' : 'error'}
                text={t(areaErrorKeys[discoveryError])}
              />
              <Button variant="tinted" label={t('common.retry')} onPress={reloadPlaces} />
            </View>
          ) : null}

          {discoveryPosition && !(selected && selection.poi) ? (
            <View style={{ gap: 12 }}>
              {displayedPlaces.length > 0 ? (
                <View style={{ marginHorizontal: -metrics.margin }}>
                  <PlacesCarousel
                    places={displayedPlaces}
                    selectedId={selected?.poiId}
                    selectionKey={selectionKey}
                    position={position}
                    navigate
                    onNavigate={(poi) => void openPlace(poi.id)}
                  />
                </View>
              ) : discoveryError || poolError ? null : poolReady || slow ? (
                <>
                  <Text variant="subheadline">
                    {poolReady ? t('home.noPlaces') : t('home.loadingPlaces')}
                  </Text>
                  {poolReady ? (
                    <Button variant="tinted" label={t('common.retry')} onPress={reloadPlaces} />
                  ) : null}
                </>
              ) : (
                <ScrollView
                  horizontal
                  scrollEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -metrics.margin }}
                  contentContainerStyle={{ gap: 12, paddingHorizontal: metrics.margin }}
                  accessibilityLabel={t('home.loadingPlaces')}
                >
                  {[0, 1, 2].map((i) => (
                    <PlaceCardSkeleton key={i} />
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}

          {discoveryPosition &&
          shouldOfferAppleFallback({
            available: process.env.EXPO_OS === 'ios' && isApplePlacesAvailable,
            hasPosition: position !== null,
            osmPlaceCount: displayedPlaces.length,
            osmReady: poolReady,
            // A slow search counts as failed: Apple Maps shows results while OSM ingestion is still queued.
            osmFailed: Boolean(discoveryError || poolError || slow),
          }) ? (
            <AppleNearbyFallback position={discoveryPosition} />
          ) : null}

          <ListGroup title={t('home.moreWays')}>
            <ListRow
              icon="edit-3"
              label={t('home.plannedTitle')}
              hint={t('home.plannedBody')}
              onPress={() => router.push('/plan')}
            />
            <ListRow
              icon="git-branch"
              label={t('home.forkTitle')}
              hint={t('home.forkBody')}
              onPress={() => router.push('/fork')}
            />
            <ListRow
              icon="users"
              label={t('home.spotsTitle')}
              hint={t('home.premadeHint')}
              onPress={() => router.push('/tours')}
            />
          </ListGroup>
        </View>
      </Sheet>
      <PauseFinder
        open={pauseFinderOpen}
        onClose={() => setPauseFinderOpen(false)}
        position={position ?? undefined}
      />
    </View>
  );
}

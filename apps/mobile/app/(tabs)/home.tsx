import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Linking,
  PixelRatio,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image as RemoteImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  REGION_FIXTURES,
  haversineMatrix,
  rankRoamStarts,
  spotScale,
  tilesAround,
  type ExploredSpot,
  type Poi,
} from '@tuur/shared';
import { useBackend } from '../../src/backend';
import { Banner } from '../../src/components/Banner';
import { WordmarkPill } from '../../src/components/Brand';
import { Button, IconButton } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { INTEREST_ICON } from '../../src/components/icons';
import { ListGroup, ListRow } from '../../src/components/ListGroup';
import { Mascot, type MascotPose } from '../../src/components/Mascot';
import { PlaceCard, PlaceCardSkeleton, PLACE_CARD_WIDTH } from '../../src/components/PlaceCard';
import { RunningTour } from '../../src/components/RunningTour';
import { Sheet } from '../../src/components/Sheet';
import { SpinningMark } from '../../src/components/SpinningMark';
import { Text } from '../../src/components/Text';
import { TuurMap } from '../../src/components/TuurMap';
import { usePoiPool } from '../../src/hooks/usePoiPool';
import { useActiveSession } from '../../src/guide/session';
import { useArea } from '../../src/location/useArea';
import { usePosition } from '../../src/location/usePosition';
import { useSettings } from '../../src/state/settings';
import { metrics, shadow, sys } from '../../src/theme';

const PEEK = 104;
/** Height of the mini player row that joins the sheet header while a tour runs. */
const MINI_H = 72;

/**
 * Explore tab (spec 11, D40/D42): the map is the content, everything else floats above it. A nonmodal bottom sheet
 * holds what tuur found nearby and the three ways to start (roam first, the easiest). Pulling it down leaves the
 * map to the places other listeners explored, bigger when popular, a flame when hot.
 */
export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const backend = useBackend();
  const { position, request } = usePosition();
  const area = useArea(position, { tours: false });
  const session = useActiveSession();
  const center = position ?? REGION_FIXTURES[0]!.center;
  const interests = useSettings((s) => s.interests);
  // without a position the carousel still shows the demo region's best places, so the first launch is never empty
  const { pool, ready: poolReady } = usePoiPool(position ?? REGION_FIXTURES[0]!.center, 1);
  // the best places to start nearby: what makes the app understandable at a glance
  const places = useMemo(
    () => (poolReady ? rankRoamStarts(position ?? center, pool.all(), interests).slice(0, 8) : []),
    [poolReady, position, center, pool, interests],
  );
  const minutesTo = (p: Poi) =>
    position
      ? Math.max(1, Math.round(haversineMatrix([position, p.location], 'foot-walking').minutes[0]![1]!))
      : 0;
  const [sheetIndex, setSheetIndex] = useState(1);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (poolReady) return setSlow(false);
    const id = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(id);
  }, [poolReady]);
  const explore = sheetIndex === 0;
  const [spots, setSpots] = useState<ExploredSpot[]>([]);
  const [spotsLoaded, setSpotsLoaded] = useState(false);
  const [selected, setSelected] = useState<ExploredSpot | undefined>();

  // the peek height follows the text size so the header is never cut off at large Dynamic Type sizes
  // the tab bar sits at the bottom edge: the inset normally includes it, the floor covers setups where it does not
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 83 : 0);
  const peek =
    Math.round(PEEK * Math.min(2, Math.max(1, PixelRatio.getFontScale()))) +
    (session ? MINI_H : 0) +
    bottomPad;
  const medium = Math.max(420, Math.round(screenH * 0.66)) + (session ? MINI_H : 0) + bottomPad;

  // Explored spots of the surrounding tiles (loaded once the area exists; only tile ids leave the device).
  const tile = area.tile;
  const ready = area.phase === 'ready' || area.phase === 'low_content';
  useEffect(() => {
    if (!tile || !ready) return;
    let cancelled = false;
    void backend
      .getExploredSpots(tilesAround(tile, 1))
      .then((s) => !cancelled && setSpots(s))
      .catch(() => undefined)
      .finally(() => !cancelled && setSpotsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [backend, tile, ready]);
  const maxExplorers = Math.max(0, ...spots.map((s) => s.explorers));
  const mapSpots = useMemo(
    () =>
      explore
        ? spots.map((s) => ({
            id: s.poiId,
            name: s.name,
            location: s.location,
            ...(s.interest ? { interest: s.interest } : {}),
            scale: spotScale(s.explorers, maxExplorers),
            hot: s.hot,
          }))
        : [],
    [explore, spots, maxExplorers],
  );

  // Tuu mirrors the area state (D46): points at the location prompt, studies the map when there is little nearby,
  // thinks when loading failed.
  const tuuPose: MascotPose =
    area.phase === 'no-location'
      ? 'point'
      : area.phase === 'low_content'
        ? 'map'
        : area.phase === 'failed'
          ? 'think'
          : 'idle';

  const exploring = area.phase === 'exploring' || area.phase === 'generating';
  const status = exploring
    ? t('loading.exploring')
    : explore && spotsLoaded
      ? spots.length > 0
        ? t('home.spotsHint')
        : t('home.spotsNone')
      : position
        ? t('home.heroBody')
        : t('home.examplesBody');

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

  const goExplore = (on: boolean) => {
    setSheetIndex(on ? 0 : 1);
    if (!on) setSelected(undefined);
  };

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <TuurMap
        center={center}
        zoom={15}
        user={position ?? undefined}
        bottomInset={explore ? peek + (selected ? 150 : 0) : Math.min(medium - 40, screenH * 0.5)}
        spots={mapSpots}
        onSpotPress={(id) => setSelected(spots.find((s) => s.poiId === id))}
        onMapPress={() => (explore ? setSelected(undefined) : goExplore(true))}
      />

      <View style={{ position: 'absolute', top: insets.top + 8, left: metrics.margin }}>
        <WordmarkPill />
      </View>

      <Sheet
        snapPoints={[peek, medium]}
        index={sheetIndex}
        onIndexChange={(i) => {
          setSheetIndex(i);
          if (i !== 0) setSelected(undefined);
        }}
        handleLabel={explore ? t('home.showModes') : t('home.mapHint')}
        header={
          <View>
            {session ? (
              <View style={{ paddingHorizontal: metrics.margin, paddingBottom: 8 }}>
                <RunningTour />
              </View>
            ) : null}
            <View
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: metrics.margin,
                paddingBottom: 12,
              }}
            >
              <Mascot pose={tuuPose} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="title3" accessibilityRole="header">
                  {explore
                    ? t('home.spotsTitle')
                    : position
                      ? t('home.storiesNearby')
                      : t('home.examplesTitle')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {exploring ? <SpinningMark size={16} label={t('loading.exploring')} /> : null}
                  <Text variant="subheadline" style={{ flexShrink: 1 }}>
                    {status}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        }
      >
        <View style={{ gap: 24, paddingTop: 4 }}>
          {area.phase === 'no-location' ? (
            <Button
              variant="tinted"
              icon="map-pin"
              label={t('home.enableLocation')}
              onPress={() => void request()}
            />
          ) : null}
          {area.phase === 'failed' ? (
            <View style={{ gap: 12 }}>
              <Banner
                tone="error"
                text={area.errorCode === 'network' ? t('errors.network') : t('errors.generic')}
              />
              <Button variant="tinted" label={t('common.retry')} onPress={area.reload} />
            </View>
          ) : null}

          {area.phase !== 'failed' ? (
            <View style={{ gap: 12 }}>
              {places.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={PLACE_CARD_WIDTH + 12}
                  style={{ marginHorizontal: -metrics.margin }}
                  contentContainerStyle={{ gap: 12, paddingHorizontal: metrics.margin }}
                >
                  {places.map((p) => (
                    <PlaceCard
                      key={p.id}
                      poi={p}
                      minutes={position ? minutesTo(p) : undefined}
                      onPress={() => void openPlace(p.id)}
                    />
                  ))}
                </ScrollView>
              ) : poolReady || slow ? (
                <Text variant="subheadline">{poolReady ? t('home.noPlaces') : t('home.loadingPlaces')}</Text>
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

          <View style={{ gap: 8 }}>
            <Button
              label={t('home.roamCta')}
              icon="compass"
              onPress={() => router.push('/roam')}
              accessibilityHint={t('home.roamBody')}
            />
          </View>

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
              hint={t('home.spotsHint')}
              onPress={() => goExplore(true)}
            />
          </ListGroup>
        </View>
      </Sheet>

      {explore && selected ? (
        <SpotCard
          spot={selected}
          bottom={peek + 12}
          onGo={() => router.push({ pathname: '/roam', params: { start: selected.poiId } })}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </View>
  );
}

/** A place other listeners explored: floats above the collapsed sheet with a photo, how popular it is and the way there. */
function SpotCard({
  spot,
  bottom,
  onGo,
  onClose,
}: {
  spot: ExploredSpot;
  bottom: number;
  onGo: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
  }, [spot.poiId, pop]);
  const meta = [
    spot.hot ? t('home.hot') : undefined,
    spot.interest ? t(`interests.${spot.interest}`) : undefined,
    t('home.explorers', { count: spot.explorers }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: metrics.margin,
        right: metrics.margin,
        bottom,
        flexDirection: 'row',
        gap: 12,
        padding: 12,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: sys.elevated,
        ...shadow.card,
        opacity: pop,
        transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}
    >
      {spot.image ? (
        <RemoteImage
          source={{ uri: spot.image.thumbUrl ?? spot.image.url }}
          style={{ width: 84, height: 96, borderRadius: 12 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: 84,
            height: 96,
            borderRadius: 12,
            backgroundColor: sys.accentTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={spot.interest ? INTEREST_ICON[spot.interest] : 'map-marker-radius'}
            size={34}
            color={sys.accentText}
          />
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <Text variant="headline" numberOfLines={2} style={{ flex: 1 }}>
            {spot.name}
          </Text>
          <IconButton icon="x" label={t('paywall.close')} onPress={onClose} size={32} />
        </View>
        <Text variant="footnote">{meta}</Text>
        <Button
          label={t('home.spotGo')}
          icon="navigation"
          size="regular"
          onPress={onGo}
          style={{ marginTop: 4 }}
        />
      </View>
    </Animated.View>
  );
}

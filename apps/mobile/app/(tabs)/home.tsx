import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PixelRatio, View, useWindowDimensions } from 'react-native';
import { Image as RemoteImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REGION_FIXTURES, spotScale, tilesAround, type ExploredSpot } from '@tuur/shared';
import { useBackend } from '../../src/backend';
import { Banner } from '../../src/components/Banner';
import { Button, IconButton } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { INTEREST_ICON } from '../../src/components/icons';
import { ListGroup, ListRow } from '../../src/components/ListGroup';
import { Mascot, type MascotPose } from '../../src/components/Mascot';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { Sheet } from '../../src/components/Sheet';
import { SpinningMark } from '../../src/components/SpinningMark';
import { Text } from '../../src/components/Text';
import { TuurMap } from '../../src/components/TuurMap';
import { useActiveSession } from '../../src/guide/session';
import { useArea } from '../../src/location/useArea';
import { usePosition } from '../../src/location/usePosition';
import { useSettings } from '../../src/state/settings';
import { metrics, shadow, sys } from '../../src/theme';

const PEEK = 104;

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
  const lang = useSettings((s) => s.language);
  const { permission, position, request } = usePosition();
  const area = useArea(position, { tours: false });
  const session = useActiveSession();
  const center = position ?? REGION_FIXTURES[0]!.center;
  const poiCount = area.area?.poiCount ?? 0;
  const [sheetIndex, setSheetIndex] = useState(1);
  const explore = sheetIndex === 0;
  const [spots, setSpots] = useState<ExploredSpot[]>([]);
  const [spotsLoaded, setSpotsLoaded] = useState(false);
  const [selected, setSelected] = useState<ExploredSpot | undefined>();

  // the peek height follows the text size so the header is never cut off at large Dynamic Type sizes
  const peek = Math.round(PEEK * Math.min(2, Math.max(1, PixelRatio.getFontScale()))) + insets.bottom;
  const medium = Math.max(380, Math.round(screenH * 0.5)) + insets.bottom;

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
      : poiCount > 0
        ? t('home.nearby', { count: poiCount })
        : t('home.yourArea');

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
        bottomInset={explore ? peek + (selected ? 150 : 0) : medium - 40}
        spots={mapSpots}
        onSpotPress={(id) => setSelected(spots.find((s) => s.poiId === id))}
        onMapPress={() => (explore ? setSelected(undefined) : goExplore(true))}
      />

      <Sheet
        snapPoints={[peek, medium]}
        index={sheetIndex}
        onIndexChange={(i) => {
          setSheetIndex(i);
          if (i !== 0) setSelected(undefined);
        }}
        handleLabel={explore ? t('home.showModes') : t('home.mapHint')}
        header={
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
            <Mascot pose={tuuPose} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title3" accessibilityRole="header">
                {t('home.greeting')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {exploring ? <SpinningMark size={16} label={t('loading.exploring')} /> : null}
                <Text variant="subheadline" style={{ flexShrink: 1 }}>
                  {status}
                </Text>
              </View>
            </View>
          </View>
        }
      >
        <View style={{ gap: 20, paddingTop: 4 }}>
          {session ? (
            <MiniPlayer
              session={session}
              title={
                session.tour?.texts[lang]?.title ??
                (session.mode === 'roam'
                  ? t('roam.title')
                  : session.mode === 'fork'
                    ? t('fork.title')
                    : t('home.continueTour'))
              }
              onOpen={() => router.push('/play')}
            />
          ) : null}

          {area.phase === 'no-location' ? (
            <View style={{ gap: 12 }}>
              <Banner
                icon="map-pin"
                text={permission === 'denied' ? t('permissions.locationDenied') : t('home.noLocation')}
              />
              <Button variant="tinted" label={t('home.enableLocation')} onPress={() => void request()} />
            </View>
          ) : null}
          {area.phase === 'low_content' ? (
            <Banner icon="compass" text={`${t('home.lowContentTitle')}. ${t('home.lowContentBody')}`} />
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

          <View style={{ gap: 8 }}>
            <Button
              label={t('home.roamCta')}
              icon="compass"
              onPress={() => router.push('/roam')}
              accessibilityHint={t('home.roamBody')}
            />
            <Text variant="footnote" align="center">
              {t('home.roamBody')}
            </Text>
          </View>

          <ListGroup>
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
        <Button label={t('home.spotGo')} icon="navigation" size="regular" onPress={onGo} style={{ marginTop: 4 }} />
      </View>
    </Animated.View>
  );
}

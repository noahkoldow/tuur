import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, View } from 'react-native';
import { Image as RemoteImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REGION_FIXTURES, spotScale, tilesAround, type ExploredSpot } from '@tuur/shared';
import { useBackend } from '../src/backend';
import { Banner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { INTEREST_ICON } from '../src/components/icons';
import { Mascot, type MascotPose } from '../src/components/Mascot';
import { MiniPlayer } from '../src/components/MiniPlayer';
import { ModeCarousel, type ModeItem } from '../src/components/ModeCarousel';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { TuurMap } from '../src/components/TuurMap';
import { useActiveSession } from '../src/guide/session';
import { useArea } from '../src/location/useArea';
import { usePosition } from '../src/location/usePosition';
import { haptics, springs } from '../src/motion';
import { useSettings } from '../src/state/settings';
import { colors, radii, shadow } from '../src/theme';
import wordmark from '../assets/wordmark-red.png';

/** Height of the mode panel; collapsed it shrinks to a handle bar so the explore map gets the screen. */
const PANEL_H = 440;
const COLLAPSED_H = 84;

/**
 * Home (spec 11, adapted in DECISIONS.md D40/D42): full-screen map, brand bar with the profile, and the individual
 * modes as a swipeable card carousel (roam first, the easiest start). Tapping the map or swiping the panel down
 * switches to exploring: places other users explored, bigger when popular, a flame when hot.
 */
export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const lang = useSettings((s) => s.language);
  const { permission, position, request } = usePosition();
  const area = useArea(position, { tours: false });
  const session = useActiveSession();
  const center = position ?? REGION_FIXTURES[0]!.center;
  const poiCount = area.area?.poiCount ?? 0;
  const [explore, setExplore] = useState(false);
  const [spots, setSpots] = useState<ExploredSpot[]>([]);
  const [spotsLoaded, setSpotsLoaded] = useState(false);
  const [selected, setSelected] = useState<ExploredSpot | undefined>();

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

  // Panel: expanded (modes) or collapsed (explore), dragged by its handle area or toggled by taps.
  const collapsedY = PANEL_H - COLLAPSED_H;
  const y = useRef(new Animated.Value(0)).current;
  const snap = (collapse: boolean, velocity = 0) => {
    if (collapse !== exploreRef.current) haptics.select();
    setExplore(collapse);
    if (!collapse) setSelected(undefined);
    Animated.spring(y, {
      toValue: collapse ? collapsedY : 0,
      velocity,
      useNativeDriver: true,
      ...springs.sheet,
    }).start();
  };
  const exploreRef = useRef(explore);
  exploreRef.current = explore;
  const pan = useRef(
    PanResponder.create({
      // vertical drags anywhere on the panel move it; horizontal ones stay with the mode carousel
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dy) > 8 && Math.abs(g.dy) > 1.5 * Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        const raw = (exploreRef.current ? collapsedY : 0) + g.dy;
        y.setValue(raw < 0 ? raw * 0.25 : raw > collapsedY ? collapsedY + (raw - collapsedY) * 0.25 : raw);
      },
      onPanResponderRelease: (_, g) => {
        const projected = (exploreRef.current ? collapsedY : 0) + g.dy + g.vy * 200;
        snap(projected > collapsedY / 2, g.vy);
      },
    }),
  ).current;

  // Tuu greets next to the question and mirrors the area state (D46): points at the location button,
  // studies the map when there is little nearby, thinks when loading failed.
  const tuuPose: MascotPose =
    area.phase === 'no-location'
      ? 'point'
      : area.phase === 'low_content'
        ? 'map'
        : area.phase === 'failed'
          ? 'think'
          : 'idle';

  const modes: ModeItem[] = [
    {
      kind: 'roam',
      icon: 'compass',
      title: t('home.roamTitle'),
      body: t('home.roamBody'),
      cta: t('home.roamCta'),
      onPress: () => router.push('/roam'),
    },
    {
      kind: 'planned',
      icon: 'edit-3',
      title: t('home.plannedTitle'),
      body: t('home.plannedBody'),
      cta: t('home.plannedCta'),
      onPress: () => router.push('/plan'),
    },
    {
      kind: 'fork',
      icon: 'git-branch',
      title: t('home.forkTitle'),
      body: t('home.forkBody'),
      cta: t('home.forkCta'),
      onPress: () => router.push('/fork'),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.subtle }}>
      <TuurMap
        center={center}
        zoom={15}
        user={position ?? undefined}
        bottomInset={explore ? COLLAPSED_H + (selected ? 150 : 0) : PANEL_H - 40}
        spots={mapSpots}
        onSpotPress={(id) => setSelected(spots.find((s) => s.poiId === id))}
        onMapPress={() => (explore ? setSelected(undefined) : snap(true))}
      />

      {/* brand bar */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 10 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View
            style={{
              paddingHorizontal: 16,
              height: 48,
              justifyContent: 'center',
              borderRadius: radii.pill,
              backgroundColor: colors.surface.base,
              ...shadow.card,
            }}
          >
            <Image
              source={wordmark}
              accessibilityRole="header"
              accessibilityLabel="tuur"
              style={{ width: 64, height: 24 }}
              resizeMode="contain"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.open')}
            onPress={() => router.push('/profile')}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surface.subtle : colors.surface.base,
              ...shadow.card,
            })}
          >
            <Feather name="user" size={22} color={colors.ink.primary} />
          </Pressable>
        </View>
        <AreaChip
          phase={area.phase}
          poiCount={poiCount}
          explore={explore}
          spotCount={spots.length}
          spotsLoaded={spotsLoaded}
        />
      </View>

      {/* mode panel */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: PANEL_H + insets.bottom,
          paddingBottom: insets.bottom + 14,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          backgroundColor: colors.surface.base,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
          transform: [{ translateY: y }],
        }}
        {...pan.panHandlers}
      >
        <View style={{ paddingTop: 10, paddingHorizontal: 20, gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={explore ? t('home.showModes') : t('home.mapHint')}
            onPress={() => snap(!explore)}
            style={{ alignItems: 'center', paddingBottom: 6 }}
          >
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          </Pressable>
          {explore ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => snap(false)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text variant="heading">{t('home.spotsTitle')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text variant="label" color={colors.brand.redPressed}>
                  {t('home.showModes')}
                </Text>
                <Feather name="chevron-up" size={18} color={colors.brand.redPressed} />
              </View>
            </Pressable>
          ) : (
            <>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Mascot pose={tuuPose} size={48} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading" accessibilityRole="header">
                    {t('home.greeting')}
                  </Text>
                </View>
              </View>
              {area.phase === 'no-location' ? (
                <View style={{ gap: 8 }}>
                  <Banner
                    icon="map-pin"
                    text={permission === 'denied' ? t('permissions.locationDenied') : t('home.noLocation')}
                  />
                  <Button
                    variant="secondary"
                    label={t('home.enableLocation')}
                    onPress={() => void request()}
                  />
                </View>
              ) : null}
              {area.phase === 'low_content' ? (
                <Banner icon="compass" text={`${t('home.lowContentTitle')}. ${t('home.lowContentBody')}`} />
              ) : null}
              {area.phase === 'failed' ? (
                <View style={{ gap: 8 }}>
                  <Banner
                    tone="error"
                    text={area.errorCode === 'network' ? t('errors.network') : t('errors.generic')}
                  />
                  <Button variant="secondary" label={t('common.retry')} onPress={area.reload} />
                </View>
              ) : null}
            </>
          )}
        </View>
        {/* stays mounted and fades with the panel instead of popping out mid-animation */}
        <Animated.View
          pointerEvents={explore ? 'none' : 'auto'}
          style={{
            marginTop: 12,
            opacity: y.interpolate({
              inputRange: [0, collapsedY * 0.6],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          }}
        >
          <ModeCarousel items={modes} />
        </Animated.View>
      </Animated.View>

      {explore && selected ? (
        <SpotCard
          spot={selected}
          bottom={COLLAPSED_H + insets.bottom + 12}
          onGo={() => router.push({ pathname: '/roam', params: { start: selected.poiId } })}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </View>
  );
}

/** Floating status pill under the brand bar: exploring animation, then what tuur found nearby. */
function AreaChip({
  phase,
  poiCount,
  explore,
  spotCount,
  spotsLoaded,
}: {
  phase: string;
  poiCount: number;
  explore: boolean;
  spotCount: number;
  spotsLoaded: boolean;
}) {
  const { t } = useTranslation();
  if (phase === 'no-location' || phase === 'failed') return null;
  const exploring = phase === 'exploring' || phase === 'generating';
  const text = exploring
    ? t('loading.exploring')
    : explore && spotsLoaded
      ? spotCount > 0
        ? t('home.spotsHint')
        : t('home.spotsNone')
      : poiCount > 0
        ? t('home.nearby', { count: poiCount })
        : t('home.yourArea');
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 10,
        paddingRight: 14,
        paddingVertical: 8,
        borderRadius: radii.pill,
        backgroundColor: colors.surface.base,
        ...shadow.card,
      }}
    >
      {exploring ? (
        <SpinningMark size={20} label={t('loading.exploring')} />
      ) : (
        <Feather name={explore ? 'users' : 'map-pin'} size={16} color={colors.brand.redPressed} />
      )}
      <Text variant="label" style={{ flexShrink: 1 }}>
        {text}
      </Text>
    </View>
  );
}

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
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom,
        flexDirection: 'row',
        gap: 12,
        padding: 12,
        borderRadius: radii.lg,
        backgroundColor: colors.surface.base,
        ...shadow.card,
        opacity: pop,
        transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}
    >
      {spot.image ? (
        <RemoteImage
          source={{ uri: spot.image.thumbUrl ?? spot.image.url }}
          style={{ width: 84, height: 96, borderRadius: radii.md }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: 84,
            height: 96,
            borderRadius: radii.md,
            backgroundColor: colors.brand.redTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons
            name={spot.interest ? INTEREST_ICON[spot.interest] : 'map-marker-radius'}
            size={34}
            color={colors.brand.redPressed}
          />
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <Text variant="heading" numberOfLines={2} style={{ flex: 1 }}>
            {spot.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('paywall.close')}
            hitSlop={10}
            onPress={onClose}
          >
            <Feather name="x" size={20} color={colors.ink.secondary} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {spot.hot ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radii.pill,
                backgroundColor: colors.brand.redTint,
              }}
            >
              <MaterialCommunityIcons name="fire" size={13} color={colors.brand.redPressed} />
              <Text
                variant="caption"
                style={{ color: colors.brand.redPressed, fontSize: 12, lineHeight: 16 }}
              >
                {t('home.hot')}
              </Text>
            </View>
          ) : null}
          <Text variant="caption">
            {[
              spot.interest ? t(`interests.${spot.interest}`) : undefined,
              t('home.explorers', { count: spot.explorers }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Button
          label={t('home.spotGo')}
          icon="navigation"
          onPress={onGo}
          style={{ minHeight: 44, marginTop: 4 }}
        />
      </View>
    </Animated.View>
  );
}

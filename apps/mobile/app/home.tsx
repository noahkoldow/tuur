import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { REGION_FIXTURES } from '@tuur/shared';
import { Banner } from '../src/components/Banner';
import { Button, IconButton } from '../src/components/Button';
import { Sheet } from '../src/components/Sheet';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { canStartTour, useEntitlementStore } from '../src/billing/entitlements';
import { TourCard } from '../src/components/TourCard';
import { TuurMap } from '../src/components/TuurMap';
import { useActiveSession } from '../src/guide/session';
import { useArea } from '../src/location/useArea';
import { usePosition } from '../src/location/usePosition';
import { useSettings } from '../src/state/settings';
import { colors, radii } from '../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MODES = [
  {
    key: 'modeStandard',
    hint: 'modeStandardHint',
    icon: 'map' as const,
    route: '/home' as const,
    enabled: true,
  },
  {
    key: 'modePlanned',
    hint: 'modePlannedHint',
    icon: 'edit-3' as const,
    route: '/plan' as const,
    enabled: false,
  },
  {
    key: 'modeFork',
    hint: 'modeForkHint',
    icon: 'git-branch' as const,
    route: '/fork' as const,
    enabled: false,
  },
  {
    key: 'modeRoam',
    hint: 'modeRoamHint',
    icon: 'compass' as const,
    route: '/roam' as const,
    enabled: false,
  },
];

/** Home (spec 11): map of the surroundings, mode selection above, auto tours of the current place below. */
export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lang = useSettings((s) => s.language);
  const { permission, position, request } = usePosition();
  const area = useArea(position);
  const session = useActiveSession();
  const ent = useEntitlementStore();
  const [sheetIndex, setSheetIndex] = useState(1);
  const place = area.tours[0]?.placeName;
  const center = position ?? REGION_FIXTURES[0]!.center;
  const fit = useMemo(
    () =>
      area.tours.length
        ? area.tours.flatMap((t) => [
            { lat: t.bbox.south, lng: t.bbox.west },
            { lat: t.bbox.north, lng: t.bbox.east },
          ])
        : undefined,
    [area.tours],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <TuurMap center={center} user={position ?? undefined} {...(fit ? { fit } : {})} bottomInset={320} />

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 10 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="title" color={colors.brand.red} accessibilityRole="header">
            tuur
          </Text>
          <IconButton
            icon="settings"
            label={t('common.settings')}
            onPress={() => router.push('/settings')}
            size={44}
          />
        </View>
        <View
          style={{
            backgroundColor: colors.surface.base,
            borderRadius: radii.lg,
            padding: 10,
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 10,
            elevation: 3,
          }}
        >
          <Text variant="label" style={{ marginBottom: 8, paddingHorizontal: 4 }}>
            {t('home.modes')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MODES.map((m, i) => (
              <Pressable
                key={m.key}
                accessibilityRole="button"
                accessibilityLabel={`${t(`home.${m.key}`)}. ${t(`home.${m.hint}`)}`}
                accessibilityState={{ selected: i === 0 }}
                onPress={() => (m.route === '/home' ? undefined : router.push(m.route as never))}
                style={{
                  // 2 x 2 grid: all four modes are visible at once, nothing is cut off
                  flexBasis: '47%',
                  flexGrow: 1,
                  padding: 10,
                  borderRadius: radii.md,
                  backgroundColor: i === 0 ? colors.brand.redTint : colors.surface.subtle,
                  gap: 4,
                  minHeight: 72,
                }}
              >
                <Feather
                  name={m.icon}
                  size={20}
                  color={i === 0 ? colors.brand.redPressed : colors.ink.primary}
                />
                <Text variant="label" numberOfLines={1}>
                  {t(`home.${m.key}`)}
                </Text>
                <Text variant="caption" numberOfLines={1}>
                  {t(`home.${m.hint}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <Sheet
        snapPoints={[150, 340, 620]}
        index={sheetIndex}
        onIndexChange={setSheetIndex}
        handleLabel={t('home.toursNearbyNoPlace')}
      >
        <View style={{ gap: 14 }}>
          {session ? (
            <Button
              label={session.tour?.texts[lang]?.title ?? t('home.continueTour')}
              icon="headphones"
              onPress={() => router.push('/play')}
            />
          ) : null}
          <Text variant="heading" accessibilityRole="header">
            {place ? t('home.toursNearby', { place }) : t('home.toursNearbyNoPlace')}
          </Text>

          {area.phase === 'no-location' ? (
            <View style={{ gap: 12 }}>
              <Banner
                text={permission === 'denied' ? t('permissions.locationDenied') : t('home.noLocation')}
              />
              <Button label={t('home.enableLocation')} onPress={() => void request()} />
            </View>
          ) : null}

          {area.phase === 'exploring' || area.phase === 'generating' ? (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 18 }}>
              <SpinningMark size={72} label={t('loading.exploring')} />
              <Text variant="heading" align="center">
                {area.phase === 'exploring' ? t('loading.exploring') : t('loading.tours')}
              </Text>
              <Text variant="caption" align="center">
                {t('loading.exploringHint')}
              </Text>
            </View>
          ) : null}

          {area.phase === 'low_content' ? (
            <View style={{ gap: 10 }}>
              <Text variant="heading">{t('home.lowContentTitle')}</Text>
              <Text variant="bodySecondary">{t('home.lowContentBody')}</Text>
              <Button label={t('home.lowContentAction')} onPress={() => router.push('/roam')} />
            </View>
          ) : null}

          {area.phase === 'failed' ? (
            <View style={{ gap: 10 }}>
              <Banner
                tone="error"
                text={area.errorCode === 'network' ? t('errors.network') : t('errors.generic')}
              />
              <Button variant="secondary" label={t('common.retry')} onPress={area.reload} />
            </View>
          ) : null}

          {area.phase === 'ready' && area.tours.length === 0 ? (
            <Text variant="bodySecondary">{t('home.noTours')}</Text>
          ) : null}

          {[...area.tours]
            .sort((a, b) => Number(b.free) - Number(a.free) || a.durationMinutes - b.durationMinutes)
            .map((tour) => (
              <TourCard
                key={tour.id}
                tour={tour}
                lang={lang}
                locked={!canStartTour(ent, tour.id, tour.free)}
                onPress={() => router.push({ pathname: '/tour/[id]', params: { id: tour.id } })}
              />
            ))}
        </View>
      </Sheet>
    </View>
  );
}

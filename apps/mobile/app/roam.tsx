import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Pressable, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haversineMatrix, rankRoamStarts, type Poi } from '@tuur/shared';
import { Banner } from '../src/components/Banner';
import { Button, IconButton } from '../src/components/Button';
import { Icon } from '../src/components/Icon';
import { ListGroup, ListRow } from '../src/components/ListGroup';
import { Mascot } from '../src/components/Mascot';
import { Sheet } from '../src/components/Sheet';
import { interestOf } from '../src/components/StopCards';
import { INTEREST_ICON } from '../src/components/icons';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { TuurMap } from '../src/components/TuurMap';
import { startRoamSession } from '../src/guide/session';
import { usePoiPool } from '../src/hooks/usePoiPool';
import { usePosition } from '../src/location/usePosition';
import { requestBackground } from '../src/location/real';
import { useBackend } from '../src/backend';
import { useSessionGate } from '../src/billing/useSessionGate';
import { haptics } from '../src/motion';
import { useSettings } from '../src/state/settings';
import { metrics, sys } from '../src/theme';

/**
 * Roam (spec 5.4), the easiest way in: one question - go straight away (tuur guides to the best spot nearby and
 * starts there) or pick the starting point - then tuur keeps telling about what lies ahead.
 */
export default function Roam() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const backend = useBackend();
  const { language, interests, frequency, simulator } = useSettings();
  const { position } = usePosition();
  const gate = useSessionGate('roam', position);
  const { pool, ready } = usePoiPool(position, 1);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [startError, setStartError] = useState<false | 'denied' | 'failed'>(false);
  const starts = useMemo(
    () => (ready && position ? rankRoamStarts(position, pool.all(), interests) : []),
    [ready, position, pool, interests],
  );
  const best = starts[0];
  // Coming from the explore map ("take me there"): start right away with that spot as the first stop.
  const { start: startParam } = useLocalSearchParams<{ start?: string }>();
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!startParam || autoStarted.current || !ready || !position) return;
    const poi = pool.all().find((p) => p.id === startParam);
    if (!poi) return;
    autoStarted.current = true;
    void start(poi, poi.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startParam, ready, position, pool]);

  const start = async (first: Poi | undefined, key: string) => {
    if (!position || !gate.require()) return;
    setBusy(key);
    setStartError(false);
    try {
      let foregroundOnly = false;
      if (!simulator && backend.kind === 'firebase') {
        const perm = await requestBackground();
        if (perm === 'denied') return setStartError('denied');
        foregroundOnly = perm === 'foreground';
      }
      await startRoamSession({
        lang: language,
        start: position,
        frequency,
        interests,
        simulate: simulator,
        ...(first ? { first } : {}),
        ...(foregroundOnly ? { foregroundOnly } : {}),
        ...(interests[0] ? { interest: interests[0] } : {}),
      });
      haptics.start();
      router.replace('/play');
    } catch {
      setStartError('failed');
    } finally {
      setBusy(undefined);
    }
  };

  const minutesTo = (p: Poi) =>
    position
      ? Math.max(1, Math.round(haversineMatrix([position, p.location], 'foot-walking').minutes[0]![1]!))
      : 0;

  const collapsed = Math.round(320 * Math.min(1.6, Math.max(1, PixelRatio.getFontScale()))) + insets.bottom;
  const expanded = Math.round(screenH * 0.72);

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <TuurMap
        center={position ?? { lat: 52.52, lng: 13.405 }}
        zoom={15}
        user={position ?? undefined}
        bottomInset={(picking ? expanded : collapsed) - 40}
        stops={starts.map((p, i) => ({
          id: p.id,
          location: p.location,
          number: i + 1,
          state: p.id === (selected ?? best?.id) ? 'current' : 'upcoming',
          ...(interestOf(p) ? { interest: interestOf(p)! } : {}),
        }))}
        // a pin only selects (starting is a deliberate second tap in the list)
        onStopPress={(id) => {
          haptics.select();
          setSelected(id);
          setPicking(true);
        }}
      />
      <View style={{ position: 'absolute', top: insets.top + 8, left: metrics.margin }}>
        <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} onMap />
      </View>

      <Sheet
        snapPoints={[collapsed, expanded]}
        index={picking ? 1 : 0}
        onIndexChange={(i) => setPicking(i === 1)}
        handleLabel={t('roam.startTitle')}
        header={
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: metrics.margin,
              paddingBottom: 12,
            }}
          >
            <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
              {t('roam.startTitle')}
            </Text>
            <Mascot pose={picking ? 'point' : 'walk'} size={52} style={{ marginVertical: -8 }} />
          </View>
        }
      >
        <View style={{ gap: 16, paddingTop: 4 }}>
          {startError ? (
            <Banner
              tone="error"
              text={startError === 'denied' ? t('errors.locationDenied') : t('errors.startFailed')}
            />
          ) : null}
          {ready && !best ? <Banner icon="compass" text={t('roam.noStarts')} /> : null}

          {!picking ? (
            <>
              <View style={{ gap: 8 }}>
                <Button
                  icon="navigation"
                  label={t('roam.startNow')}
                  loading={busy === 'now' || !ready}
                  disabled={!ready || !position}
                  accessibilityHint={t('roam.startNowHint')}
                  onPress={() => void start(best, 'now')}
                />
                <Text variant="footnote" align="center">
                  {!ready
                    ? t('roam.findingStart')
                    : best
                      ? `${best.name} · ${t('common.minutes', { count: minutesTo(best) })}`
                      : t('roam.startNowHint')}
                </Text>
              </View>
              <ListGroup>
                <ListRow
                  icon="map-pin"
                  label={t('roam.pickStart')}
                  hint={t('roam.pickStartHint')}
                  onPress={starts.length ? () => setPicking(true) : undefined}
                />
              </ListGroup>
              <Button
                variant="ghost"
                icon="compass"
                label={t('roam.walkFree')}
                loading={busy === 'free'}
                disabled={!position}
                onPress={() => void start(undefined, 'free')}
              />
            </>
          ) : (
            <>
              <ListGroup>
                {starts.map((p) => (
                  <StartRow
                    key={p.id}
                    poi={p}
                    minutes={minutesTo(p)}
                    busy={busy === p.id}
                    selected={p.id === selected}
                    onPress={() => void start(p, p.id)}
                  />
                ))}
              </ListGroup>
              <Button variant="ghost" label={t('common.back')} onPress={() => setPicking(false)} />
            </>
          )}
        </View>
      </Sheet>
    </View>
  );
}

function StartRow({
  poi,
  minutes,
  busy,
  selected,
  onPress,
}: {
  poi: Poi;
  minutes: number;
  busy: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const interest = interestOf(poi);
  const img = poi.imageRefs[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${poi.name}, ${t('common.minutes', { count: minutes })}`}
      accessibilityState={{ selected: Boolean(selected), busy }}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 64,
        paddingHorizontal: metrics.margin,
        paddingVertical: 10,
        backgroundColor: pressed || selected ? sys.fill : 'transparent',
      })}
    >
      {img ? (
        <Image
          source={{ uri: img.thumbUrl ?? img.url }}
          style={{ width: 48, height: 48, borderRadius: 10 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            backgroundColor: sys.accentTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={interest ? INTEREST_ICON[interest] : 'map-marker-radius'}
            size={24}
            color={sys.accentText}
          />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={2}>
          {poi.name}
        </Text>
        <Text variant="footnote">
          {[interest ? t(`interests.${interest}`) : undefined, t('common.minutes', { count: minutes })]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {busy ? (
        <SpinningMark size={24} label={poi.name} />
      ) : (
        <Icon name="chevron-right" size={14} color={sys.labelTertiary} weight="semibold" />
      )}
    </Pressable>
  );
}

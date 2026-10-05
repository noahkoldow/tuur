import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Linking, PixelRatio, Pressable, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haversineMatrix, rankRoamStarts, type Poi } from '@tuur/shared';
import { Banner } from '../src/components/Banner';
import { Button, IconButton } from '../src/components/Button';
import { Icon } from '../src/components/Icon';
import { PlacePhoto } from '../src/components/PlacePhoto';
import { ListGroup, ListRow } from '../src/components/ListGroup';
import { Sheet } from '../src/components/Sheet';
import { interestOf } from '../src/components/StopCards';
import { CategoryBadge } from '../src/components/category-badge';
import { INTEREST_ICON } from '../src/components/icons';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { TuuSays, useTip } from '../src/components/TuuSays';
import { TuurMap } from '../src/components/TuurMap';
import { startRoamSession } from '../src/guide/session';
import { usePoiPool } from '../src/hooks/usePoiPool';
import { usePosition } from '../src/location/usePosition';
import { requestBackground } from '../src/location/real';
import { useBackend } from '../src/backend';
import { useSessionGate } from '../src/billing/useSessionGate';
import { haptics } from '../src/motion';
import { roamEntryState } from '../src/navigation/roamEntry';
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
  const { position, permission, request } = usePosition();
  const gate = useSessionGate('roam', position);
  const requireAccess = gate.require;
  const { pois, ready, error: areaError, reload } = usePoiPool(position, 2);
  const [picking, setPicking] = useState(false);
  const [recenterKey, recenterMap] = useReducer((key: number) => key + 1, 0);
  const [selected, setSelected] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [startError, setStartError] = useState<false | 'denied' | 'failed'>(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [attempt, retryAttempt] = useReducer((n: number) => n + 1, 0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const starts = useMemo(
    () => (ready && position ? rankRoamStarts(position, pois, interests) : []),
    [ready, position, pois, interests],
  );
  const best = starts[0];
  // Coming from the explore map ("take me there"): start right away with that spot as the first stop.
  const { start: startParam } = useLocalSearchParams<{ start?: string }>();
  const [dismissedStart, setDismissedStart] = useState<string>();
  const requestedId = startParam !== dismissedStart ? startParam : undefined;
  const requestedPlace = pois.find((p) => p.id === requestedId);
  const autoStarted = useRef<string | undefined>(undefined);

  const start = useCallback(
    async (first: Poi | undefined, key: string) => {
      if (inFlight.current || !position || !requireAccess()) return;
      inFlight.current = true;
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
        if (mounted.current) router.replace('/play');
      } catch {
        setStartError('failed');
      } finally {
        inFlight.current = false;
        setBusy(undefined);
      }
    },
    [position, requireAccess, simulator, backend.kind, language, frequency, interests, router],
  );

  useEffect(() => {
    setLoadingTimedOut(false);
    if (!position || (ready && (gate.unlocked || gate.placeId))) return;
    const timer = setTimeout(() => setLoadingTimedOut(true), 45_000);
    return () => clearTimeout(timer);
  }, [position, ready, gate.unlocked, gate.placeId, attempt]);

  const entry = roamEntryState({
    hasPosition: Boolean(position),
    ready,
    hasPlace: Boolean(requestedPlace),
    failed: Boolean(startError || areaError || gate.error || loadingTimedOut),
    unlocked: gate.unlocked,
    accessReady: Boolean(gate.placeId),
    starting: Boolean(busy),
  });
  useEffect(() => {
    if (!requestedId || !requestedPlace || entry !== 'ready' || autoStarted.current === requestedId) return;
    autoStarted.current = requestedId;
    void start(requestedPlace, requestedId);
  }, [requestedId, requestedPlace, entry, start, attempt]);

  const retry = () => {
    autoStarted.current = undefined;
    setStartError(false);
    setLoadingTimedOut(false);
    retryAttempt();
    reload();
    gate.reload();
  };
  const enableLocation = async () => {
    setLocationBusy(true);
    setLocationError(false);
    try {
      if (permission === 'denied') await Linking.openSettings();
      else await request();
    } catch {
      setLocationError(true);
    } finally {
      setLocationBusy(false);
    }
  };

  const minutesTo = (p: Poi) =>
    position
      ? Math.max(1, Math.round(haversineMatrix([position, p.location], 'foot-walking').minutes[0]![1]!))
      : 0;

  const tip = useTip('roam.intro');
  const collapsed =
    Math.round((tip.visible ? 420 : 320) * Math.min(1.6, Math.max(1, PixelRatio.getFontScale()))) +
    insets.bottom;
  const expanded = Math.round(screenH * 0.72);
  const [mapSheetHeight, setMapSheetHeight] = useState(collapsed);

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <TuurMap
        center={position ?? { lat: 52.52, lng: 13.405 }}
        zoom={15}
        user={position ?? undefined}
        bottomInset={mapSheetHeight}
        recenterKey={recenterKey}
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
        onVisibleHeightChange={setMapSheetHeight}
        onCollapse={recenterMap}
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
          </View>
        }
      >
        <View style={{ gap: 16, paddingTop: 4 }}>
          {!position ? (
            <View style={{ gap: 12 }}>
              <Banner
                icon="map-pin"
                text={t(permission === 'denied' ? 'permissions.locationDenied' : 'home.noLocation')}
              />
              {locationError ? <Banner tone="error" text={t('errors.locationUnavailable')} /> : null}
              <Button
                label={t(permission === 'denied' ? 'common.settings' : 'home.enableLocation')}
                loading={locationBusy}
                onPress={() => void enableLocation()}
              />
            </View>
          ) : requestedId ? (
            entry === 'error' || entry === 'missing' ? (
              <View style={{ gap: 12 }}>
                <Banner
                  tone="warning"
                  text={t(
                    entry === 'missing'
                      ? 'roam.startMissing'
                      : startError === 'denied'
                        ? 'errors.locationDenied'
                        : startError
                          ? 'errors.startFailed'
                          : 'curation.areaFailed',
                  )}
                />
                <Button label={t('common.retry')} onPress={retry} />
                <Button
                  variant="secondary"
                  label={t('roam.chooseAnother')}
                  onPress={() => setDismissedStart(requestedId)}
                />
              </View>
            ) : entry === 'locked' ? (
              <View style={{ gap: 12 }}>
                <Text variant="headline">{requestedPlace?.name}</Text>
                <Banner icon="lock" text={t('paywall.subtitleSession')} />
                <Button label={t('paywall.titleSession')} onPress={() => void requireAccess()} />
                <Button
                  variant="ghost"
                  label={t('roam.chooseAnother')}
                  onPress={() => setDismissedStart(requestedId)}
                />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <SpinningMark size={28} label={t('roam.findingStart')} />
                <Text variant="subheadline">{t('roam.findingStart')}</Text>
              </View>
            )
          ) : (
            <>
              {startError || areaError || gate.error || loadingTimedOut ? (
                <View style={{ gap: 12 }}>
                  <Banner
                    tone="error"
                    text={t(
                      startError === 'denied'
                        ? 'errors.locationDenied'
                        : startError
                          ? 'errors.startFailed'
                          : 'curation.areaFailed',
                    )}
                  />
                  <Button variant="tinted" label={t('common.retry')} onPress={retry} />
                </View>
              ) : null}
              {ready && !best && !areaError ? <Banner icon="compass" text={t('roam.noStarts')} /> : null}
              {!picking ? (
                <>
                  <View style={{ gap: 8 }}>
                    <Button
                      icon="navigation"
                      label={t('roam.startNow')}
                      loading={busy === 'now' || (!ready && !areaError && !loadingTimedOut)}
                      disabled={Boolean(busy) || !ready || (!gate.unlocked && !gate.placeId)}
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
                    disabled={Boolean(busy) || (!gate.unlocked && !gate.placeId)}
                    onPress={() => void start(undefined, 'free')}
                  />
                  <TuuSays pose="walk" tipId="roam.intro" text={t('tuu.roamIntro')} size={56} />
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
                        disabled={Boolean(busy)}
                        selected={p.id === selected}
                        onPress={() => void start(p, p.id)}
                      />
                    ))}
                  </ListGroup>
                  <Button variant="ghost" label={t('common.back')} onPress={() => setPicking(false)} />
                </>
              )}
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
  disabled,
  selected,
  onPress,
}: {
  poi: Poi;
  minutes: number;
  busy: boolean;
  disabled: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const interest = interestOf(poi);
  const img = poi.imageRefs[0];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: metrics.margin }}>
      <PlacePhoto
        image={img}
        name={poi.name}
        icon={interest ? INTEREST_ICON[interest] : 'map-marker-radius'}
        style={{ flex: 0, width: 72, height: 72, borderRadius: 10 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          poi.name,
          interest ? t(`interests.${interest}`) : undefined,
          t('common.minutes', { count: minutes }),
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityState={{ selected: Boolean(selected), busy, disabled }}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          flexDirection: 'row',
          flex: 1,
          alignItems: 'center',
          gap: 12,
          minHeight: 64,
          paddingRight: metrics.margin,
          paddingVertical: 10,
          backgroundColor: pressed || selected ? sys.fill : 'transparent',
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" numberOfLines={2}>
            {poi.name}
          </Text>
          {interest ? <CategoryBadge interest={interest} /> : null}
          <Text variant="footnote">{t('common.minutes', { count: minutes })}</Text>
        </View>
        {busy ? (
          <SpinningMark size={24} label={poi.name} />
        ) : (
          <Icon name="chevron-right" size={14} color={sys.labelTertiary} weight="semibold" />
        )}
      </Pressable>
    </View>
  );
}

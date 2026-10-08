import { BottomSheet, RNHostView } from '@expo/ui';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatLng } from '@tuur/shared';
import { ApplePlacesMapView, isApplePlacesAvailable } from '../../modules/tuur-apple-places';
import { applePausePlaces } from '../guide/apple-pause-places';
import {
  nearbyPausePlaces,
  openApplePauseSearch,
  openPauseDirections,
  type PauseDestination,
  type PauseFilter,
} from '../guide/pauseDestination';
import type { GuideRuntime } from '../guide/runtime';
import { useApplePausePlaces } from '../hooks/use-apple-pause-places';
import { usePoiPool } from '../hooks/usePoiPool';
import { metrics, sys } from '../theme';
import { Banner } from './Banner';
import { Button, IconButton } from './Button';
import { Chip } from './Chip';
import { Text } from './Text';

const FILTERS: PauseFilter[] = ['all', 'coffee', 'food', 'rest'];
const APPLE_FILTERS: PauseFilter[] = [...FILTERS, 'toilets'];
const SHEET_PADDING = 20;

/** An explicit pause destination never becomes a narrated stop or rewrites the tour. */
export function PauseFinder({
  open,
  onClose,
  position,
  runtime,
}: {
  open: boolean;
  onClose: () => void;
  position?: LatLng;
  runtime?: GuideRuntime;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The native sheet measures RN content intrinsically; bound its width before measuring the height.
  const contentWidth = Math.max(0, Math.min(width - insets.left - insets.right - SHEET_PADDING * 2, 500));
  const [filter, setFilter] = useState<PauseFilter>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [opening, setOpening] = useState<string>();
  const [failed, setFailed] = useState(false);
  const usesApple = process.env.EXPO_OS === 'ios';
  const osm = usePoiPool(open && !usesApple ? (position ?? null) : null, 2);
  const apple = useApplePausePlaces(open && usesApple ? (position ?? null) : null, filter);
  const { loading, error, reload } = usesApple ? apple : osm;
  const ready = usesApple ? apple.ready : osm.ready;
  const places = useMemo(() => {
    if (!position) return [];
    const results = usesApple
      ? applePausePlaces(position, apple.places, filter)
      : nearbyPausePlaces(position, osm.pois, filter).map(({ poi, ...details }) => ({
          destination: poi,
          ...details,
        }));
    return [...results].sort(
      (a, b) => Number(b.destination.id === selectedId) - Number(a.destination.id === selectedId),
    );
  }, [position, usesApple, apple.places, osm.pois, filter, selectedId]);
  const mapPlaces = useMemo(
    () => apple.places.filter((place) => places.some(({ destination }) => destination.id === place.id)),
    [apple.places, places],
  );
  const navigate = async (destination: PauseDestination) => {
    if (opening) return;
    setOpening(destination.id);
    setFailed(false);
    try {
      await openPauseDirections(
        destination,
        (url) => Linking.openURL(url),
        runtime,
        usesApple ? 'apple' : 'google',
      );
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setOpening(undefined);
    }
  };
  const searchInMaps = async () => {
    if (!position || opening) return;
    setOpening('apple-search');
    setFailed(false);
    try {
      await openApplePauseSearch(
        position,
        t(`pauseFinder.search.${filter}`),
        (url) => Linking.openURL(url),
        runtime,
      );
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setOpening(undefined);
    }
  };

  return (
    <BottomSheet
      isPresented={open}
      onDismiss={onClose}
      containerColor={sys.grouped}
      contentPadding={SHEET_PADDING}
      testID="pause-finder-sheet"
    >
      <RNHostView matchContents>
        <View
          testID="pause-finder-content"
          style={{ width: contentWidth, minWidth: 0, gap: 16, maxHeight: height * 0.72 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text variant="title2" accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>
              {t('pauseFinder.title')}
            </Text>
            <IconButton icon="x" label={t('pauseFinder.close')} onPress={onClose} />
          </View>
          <Text variant="subheadline">{t(runtime ? 'pauseFinder.activeHint' : 'pauseFinder.hint')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(usesApple ? APPLE_FILTERS : FILTERS).map((value) => (
              <Chip
                key={value}
                label={t(`pauseFinder.${value}`)}
                selected={filter === value}
                onPress={() => {
                  setFilter(value);
                  setSelectedId(undefined);
                }}
              />
            ))}
          </View>
          <ScrollView
            style={{ width: '100%', flexShrink: 1 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
          >
            {!position ? <Banner text={t('pauseFinder.location')} /> : null}
            {open && usesApple && isApplePlacesAvailable && position ? (
              <ApplePlacesMapView
                latitude={position.lat}
                longitude={position.lng}
                radiusMeters={1500}
                places={mapPlaces}
                selectedPlaceId={selectedId}
                onPlaceSelected={({ nativeEvent }) => setSelectedId(nativeEvent.id)}
                style={{ width: '100%', height: 190, borderRadius: metrics.radius.card }}
              />
            ) : null}
            {loading ? <Text accessibilityLiveRegion="polite">{t('pauseFinder.loading')}</Text> : null}
            {error ? (
              <View style={{ gap: 8 }}>
                <Banner
                  tone="error"
                  text={t(
                    usesApple && apple.error === 'unavailable'
                      ? 'pauseFinder.appleUnavailable'
                      : 'pauseFinder.loadError',
                  )}
                />
                {!(usesApple && apple.error === 'unavailable') ? (
                  <Button variant="secondary" label={t('pauseFinder.retry')} onPress={reload} />
                ) : null}
              </View>
            ) : null}
            {failed ? <Banner tone="error" text={t('pauseFinder.openError')} /> : null}
            {position && ready && !loading && !error && places.length === 0 ? (
              <Banner text={t('pauseFinder.empty')} />
            ) : null}
            {position && usesApple && (error || (ready && places.length === 0)) ? (
              <Button
                variant="tinted"
                icon="external-link"
                label={t('pauseFinder.searchApple')}
                disabled={!!opening}
                loading={opening === 'apple-search'}
                onPress={() => void searchInMaps()}
              />
            ) : null}
            {places.map(({ destination, kind, distanceM }) => (
              <View
                key={destination.id}
                style={{
                  padding: 16,
                  gap: 8,
                  borderRadius: metrics.radius.card,
                  backgroundColor: sys.elevated,
                  borderWidth: selectedId === destination.id ? 2 : 0,
                  borderColor: sys.accent,
                }}
              >
                <Text variant="headline">{destination.name}</Text>
                <Text variant="footnote">
                  {t(`pauseFinder.${kind}`)} ·{' '}
                  {t('pauseFinder.distance', { meters: Math.max(10, Math.round(distanceM / 10) * 10) })}
                </Text>
                <Button
                  size="regular"
                  variant="tinted"
                  icon="external-link"
                  label={t(usesApple ? 'pauseFinder.navigateApple' : 'pauseFinder.navigate')}
                  loading={opening === destination.id}
                  disabled={!!opening}
                  onPress={() => void navigate(destination)}
                />
              </View>
            ))}
            <Text variant="footnote" color={sys.labelSecondary}>
              {t(usesApple ? 'pauseFinder.appleSourceHint' : 'pauseFinder.sourceHint')}
            </Text>
          </ScrollView>
        </View>
      </RNHostView>
    </BottomSheet>
  );
}

import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LatLng } from '@tuur/shared';
import { ApplePlacesMapView } from '../../modules/tuur-apple-places';
import { appleSightPlaces } from '../guide/apple-pause-places';
import { openPauseDirections, type PauseDestination } from '../guide/pauseDestination';
import { useApplePlaces } from '../hooks/use-apple-pause-places';
import { metrics, sys } from '../theme';
import { Banner } from './Banner';
import { Button } from './Button';
import { Text } from './Text';

/**
 * Live fallback for areas without OSM places: museums and culture from Apple Maps, shown on an Apple map.
 * Results stay in this component's state. They are never stored, sent to the backend or AI, added to a
 * tour, or opened as a story; the only action is directions in Apple Maps.
 */
export function AppleNearbyFallback({ position }: { position: LatLng }) {
  const { t } = useTranslation();
  const apple = useApplePlaces(position, 'sights');
  const [selectedId, setSelectedId] = useState<string>();
  const [opening, setOpening] = useState<string>();
  const [failed, setFailed] = useState(false);
  const places = useMemo(() => appleSightPlaces(position, apple.places), [position, apple.places]);
  const mapPlaces = useMemo(
    () => apple.places.filter((place) => places.some(({ destination }) => destination.id === place.id)),
    [apple.places, places],
  );

  const navigate = async (destination: PauseDestination) => {
    if (opening) return;
    setOpening(destination.id);
    setFailed(false);
    try {
      await openPauseDirections(destination, (url) => Linking.openURL(url), undefined, 'apple');
    } catch {
      setFailed(true);
    } finally {
      setOpening(undefined);
    }
  };

  return (
    <View style={{ gap: 12 }} testID="apple-nearby-fallback">
      <Text variant="headline" accessibilityRole="header">
        {t('home.appleFallbackTitle')}
      </Text>
      <Text variant="subheadline">{t('home.appleFallbackHint')}</Text>
      {places.length > 0 ? (
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
      {apple.loading ? <Text accessibilityLiveRegion="polite">{t('pauseFinder.loading')}</Text> : null}
      {apple.error ? (
        <View style={{ gap: 8 }}>
          <Banner tone="error" text={t('home.appleFallbackError')} />
          <Button variant="tinted" label={t('pauseFinder.retry')} onPress={apple.reload} />
        </View>
      ) : null}
      {failed ? <Banner tone="error" text={t('pauseFinder.openError')} /> : null}
      {apple.ready && !apple.loading && !apple.error && places.length === 0 ? (
        <Banner text={t('home.appleFallbackEmpty')} />
      ) : null}
      {places.map(({ destination, category, distanceM }) => (
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
            {t(category === 'museum' ? 'home.appleFallbackMuseum' : 'home.appleFallbackCulture')} ·{' '}
            {t('pauseFinder.distance', { meters: Math.max(10, Math.round(distanceM / 10) * 10) })}
          </Text>
          <Button
            size="regular"
            variant="tinted"
            icon="external-link"
            label={t('pauseFinder.navigateApple')}
            loading={opening === destination.id}
            disabled={!!opening}
            onPress={() => void navigate(destination)}
          />
        </View>
      ))}
      <Text variant="footnote" color={sys.labelSecondary}>
        {t('pauseFinder.appleSourceHint')}
      </Text>
    </View>
  );
}

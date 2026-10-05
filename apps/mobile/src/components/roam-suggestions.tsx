import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LatLng, Poi } from '@tuur/shared';
import type { useRoamSuggestions } from '../hooks/use-roam-suggestions';
import { metrics } from '../theme';
import { Banner } from './Banner';
import { Button } from './Button';
import { PlaceCardSkeleton } from './PlaceCard';
import { PlacesCarousel } from './PlacesCarousel';
import { Text } from './Text';

export function RoamSuggestions({
  suggestions,
  position,
  selectedId,
  selectionKey,
  onChoose,
  showTitle = true,
}: {
  suggestions: ReturnType<typeof useRoamSuggestions>;
  position: LatLng | undefined;
  selectedId: string | undefined;
  selectionKey: number;
  onChoose: (poi: Poi) => void;
  showTitle?: boolean;
}) {
  const { t } = useTranslation();
  const { places, ready, error, reload, canChoose } = suggestions;
  return (
    <View style={{ gap: 12 }}>
      {showTitle ? (
        <Text variant="title3" accessibilityRole="header">
          {t('home.roamNearby')}
        </Text>
      ) : null}
      <Text variant="subheadline">{t('roam.suggestionsHint')}</Text>
      {!position ? <Text variant="subheadline">{t('home.waitingForLocation')}</Text> : null}
      {error ? (
        <View style={{ gap: 8 }}>
          <Banner tone="error" text={t('curation.areaFailed')} />
          <Button variant="tinted" label={t('common.retry')} onPress={reload} />
        </View>
      ) : null}
      {places.length ? (
        <>
          {!canChoose ? <Text variant="footnote">{t('home.roamAfterStory')}</Text> : null}
          <View style={{ marginHorizontal: -metrics.margin }}>
            <PlacesCarousel
              places={places}
              position={position}
              navigate
              disabled={!canChoose}
              selectedId={selectedId}
              selectionKey={selectionKey}
              onNavigate={onChoose}
            />
          </View>
        </>
      ) : position && ready && !error ? (
        <Text variant="subheadline">{t('home.roamNoPlaces')}</Text>
      ) : position && !error ? (
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
    </View>
  );
}

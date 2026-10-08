import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Tour } from '@tuur/shared';
import { formatKm } from '../format';
import { metrics, sys } from '../theme';
import { PlacePhoto } from './PlacePhoto';
import { PhotoInfo } from './photo-info';
import { Text } from './Text';

/** Card in the tour list (spec 5.1): cover, title, duration, length, themes, free text / partner markers. */
export function TourCard({ tour, lang, onPress }: { tour: Tour; lang: string; onPress: () => void }) {
  const { t } = useTranslation();
  const text = tour.texts[lang] ?? tour.texts['en'] ?? Object.values(tour.texts)[0];
  const km = formatKm(tour.distanceMeters, lang);
  return (
    <View
      style={{
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: sys.elevated,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${text?.title ?? tour.template}, ${t('common.minutes', { count: Math.round(tour.durationMinutes) })}, ${t('common.stops', { count: tour.stops.length })}`}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 188,
          paddingTop: 64,
          justifyContent: 'flex-end',
          backgroundColor: pressed ? sys.fill : sys.elevated,
        })}
      >
        <PlacePhoto
          image={tour.coverImage}
          name={text?.title ?? tour.template}
          icon="map"
          showInfo={false}
          style={{ position: 'absolute', inset: 0 }}
        />
        <View style={{ padding: 14, gap: 6, backgroundColor: 'rgba(17,17,17,0.76)' }}>
          <Text variant="headline" color="#FFFFFF" numberOfLines={2}>
            {text?.title ?? tour.template}
          </Text>
          <Text variant="footnote" color="#FFFFFF" numberOfLines={1}>
            {text?.teaser}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Text variant="caption" color="#FFFFFF">
              {[
                t('common.minutes', { count: Math.round(tour.durationMinutes) }),
                t('common.km', { value: km }),
                t('common.stops', { count: tour.stops.length }),
              ].join(' · ')}
            </Text>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: '#FFFFFF',
              }}
            >
              <Text variant="caption" color="#48484A" style={{ fontWeight: '600' }}>
                {t('player.textMode')}
              </Text>
            </View>
            {tour.hasPartner ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                  backgroundColor: '#FFFFFF',
                }}
              >
                <Text variant="caption" color="#48484A">
                  {t('common.partner')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      <PhotoInfo image={tour.coverImage} name={text?.title ?? tour.template} />
    </View>
  );
}

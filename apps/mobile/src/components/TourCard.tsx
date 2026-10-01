import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import type { Tour } from '@tuur/shared';
import { formatKm } from '../format';
import { metrics, sys } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Card in the tour list (spec 5.1): cover, title, duration, length, themes, free / partner markers. */
export function TourCard({
  tour,
  lang,
  locked,
  onPress,
}: {
  tour: Tour;
  lang: string;
  /** Not yet unlocked (paid tour): shows a lock so the price wall is no surprise. */
  locked?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const text = tour.texts[lang] ?? tour.texts['en'] ?? Object.values(tour.texts)[0];
  const km = formatKm(tour.distanceMeters, lang);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text?.title ?? tour.template}, ${t('common.minutes', { count: Math.round(tour.durationMinutes) })}, ${t('common.stops', { count: tour.stops.length })}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 14,
        padding: 12,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: pressed ? sys.fill : sys.elevated,
      })}
    >
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: sys.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {tour.coverImage ? (
          <Image
            source={{ uri: tour.coverImage.url }}
            style={{ width: 84, height: 84 }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Icon name="map" size={28} color={sys.labelTertiary} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4, justifyContent: 'center' }}>
        <Text variant="headline" numberOfLines={2}>
          {text?.title ?? tour.template}
        </Text>
        <Text variant="footnote" numberOfLines={2}>
          {text?.teaser}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text variant="caption">{t('common.minutes', { count: Math.round(tour.durationMinutes) })}</Text>
          <Text variant="caption">·</Text>
          <Text variant="caption">{t('common.km', { value: km })}</Text>
          <Text variant="caption">·</Text>
          <Text variant="caption">{t('common.stops', { count: tour.stops.length })}</Text>
          {locked && !tour.free ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="lock" size={13} color={sys.labelSecondary} />
              <Text variant="caption">{t('paywall.locked')}</Text>
            </View>
          ) : null}
          {tour.free ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: sys.accentTint,
              }}
            >
              <Text variant="caption" color={sys.accentText} style={{ fontWeight: '600' }}>
                {t('common.free')}
              </Text>
            </View>
          ) : null}
          {tour.hasPartner ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: sys.fill,
              }}
            >
              <Text variant="caption">{t('common.partner')}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

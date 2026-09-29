import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Tour } from '@tuur/shared';
import { colors, radii } from '../theme';
import { Text } from './Text';

/** Card in the tour list (spec 5.1): cover, title, duration, length, themes, free / partner markers. */
export function TourCard({ tour, lang, onPress }: { tour: Tour; lang: string; onPress: () => void }) {
  const { t } = useTranslation();
  const text = tour.texts[lang] ?? tour.texts['en'] ?? Object.values(tour.texts)[0];
  const km = (tour.distanceMeters / 1000).toFixed(1);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text?.title ?? tour.template}, ${t('common.minutes', { count: Math.round(tour.durationMinutes) })}, ${t('common.stops', { count: tour.stops.length })}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 14,
        padding: 12,
        borderRadius: radii.lg,
        backgroundColor: pressed ? colors.surface.subtle : colors.surface.base,
        borderWidth: 1,
        borderColor: colors.border,
      })}
    >
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: radii.md,
          overflow: 'hidden',
          backgroundColor: colors.surface.subtle,
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
          <Feather name="map" size={28} color={colors.ink.tertiary} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4, justifyContent: 'center' }}>
        <Text variant="heading" numberOfLines={2}>
          {text?.title ?? tour.template}
        </Text>
        <Text variant="caption" numberOfLines={2}>
          {text?.teaser}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text variant="caption">{t('common.minutes', { count: Math.round(tour.durationMinutes) })}</Text>
          <Text variant="caption">·</Text>
          <Text variant="caption">{t('common.km', { value: km })}</Text>
          <Text variant="caption">·</Text>
          <Text variant="caption">{t('common.stops', { count: tour.stops.length })}</Text>
          {tour.free ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: colors.brand.redTint,
              }}
            >
              <Text
                variant="caption"
                color={colors.brand.redPressed}
                style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
              >
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
                borderWidth: 1,
                borderColor: colors.brand.red,
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

import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Poi } from '@tuur/shared';
import { colors, radii } from '../theme';
import { Text } from './Text';

/** Crossroads option (spec 5.3): name, image, walking time and a teaser sentence. */
export function OptionCard({
  poi,
  walkMinutes,
  teaser,
  onPress,
}: {
  poi: Poi;
  walkMinutes: number;
  teaser?: string | undefined;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const img = poi.imageRefs[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${poi.partnerId ? `${t('partner.label')}: ` : ''}${poi.name}. ${t('fork.walk', { minutes: Math.round(walkMinutes) })}. ${teaser ?? ''}`}
      accessibilityHint={t('fork.go')}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 150,
        borderRadius: radii.lg,
        borderWidth: 1.5,
        borderColor: pressed ? colors.brand.red : colors.border,
        backgroundColor: colors.surface.base,
        overflow: 'hidden',
      })}
    >
      <View
        style={{
          height: 96,
          backgroundColor: colors.surface.subtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {img ? (
          <Image
            source={{ uri: img.thumbUrl ?? img.url }}
            style={{ width: '100%', height: 96 }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Feather name="map-pin" size={28} color={colors.ink.tertiary} />
        )}
      </View>
      <View style={{ padding: 12, gap: 6 }}>
        <Text variant="label" numberOfLines={3} style={{ fontSize: 16, lineHeight: 21 }}>
          {poi.name}
        </Text>
        <Text variant="caption">{t('fork.walk', { minutes: Math.round(walkMinutes) })}</Text>
        {poi.partnerId ? (
          <Text
            variant="caption"
            color={colors.brand.redPressed}
          >{`${t('partner.adLabel')} · ${t('partner.label')}`}</Text>
        ) : null}
        {teaser ? (
          <Text variant="caption" numberOfLines={4} color={colors.ink.primary}>
            {teaser}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

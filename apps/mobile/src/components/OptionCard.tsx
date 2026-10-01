import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import type { Poi } from '@tuur/shared';
import { metrics, sys } from '../theme';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
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
    <PressableScale
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${poi.partnerId ? `${t('partner.label')}: ` : ''}${poi.name}. ${t('fork.walk', { minutes: Math.round(walkMinutes) })}. ${teaser ?? ''}`}
      accessibilityHint={t('fork.go')}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 150,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: pressed ? sys.fill : sys.elevated,
        overflow: 'hidden',
      })}
    >
      <View
        style={{
          height: 104,
          backgroundColor: sys.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {img ? (
          <Image
            source={{ uri: img.thumbUrl ?? img.url }}
            style={{ width: '100%', height: 104 }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Icon name="map-pin" size={28} color={sys.labelTertiary} />
        )}
      </View>
      <View style={{ padding: 12, gap: 4 }}>
        <Text variant="headline" numberOfLines={3}>
          {poi.name}
        </Text>
        <Text variant="footnote">{t('fork.walk', { minutes: Math.round(walkMinutes) })}</Text>
        {poi.partnerId ? (
          <Text
            variant="footnote"
            color={sys.accentText}
          >{`${t('partner.adLabel')} · ${t('partner.label')}`}</Text>
        ) : null}
        {teaser ? (
          <Text variant="subheadline" numberOfLines={4} color={sys.label}>
            {teaser}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

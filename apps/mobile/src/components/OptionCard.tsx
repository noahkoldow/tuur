import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Poi } from '@tuur/shared';
import { metrics, sys } from '../theme';
import { PlacePhoto } from './PlacePhoto';
import { PhotoInfo } from './photo-info';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { interestOf } from './StopCards';
import { CategoryBadge } from './category-badge';
import { INTEREST_ICON } from './icons';

/** Crossroads option (spec 5.3): name, image, walking time and a teaser sentence. */
export function OptionCard({
  poi,
  walkMinutes,
  teaser,
  onPress,
  disabled = false,
}: {
  poi: Poi;
  walkMinutes: number;
  teaser?: string | undefined;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const img = poi.imageRefs[0];
  const interest = interestOf(poi);
  return (
    <View
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: sys.elevated,
        overflow: 'hidden',
      }}
    >
      <PressableScale
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`${poi.partnerId ? `${t('partner.label')}: ` : ''}${poi.name}. ${interest ? `${t(`interests.${interest}`)}. ` : ''}${t('fork.walk', { minutes: Math.round(walkMinutes) })}. ${teaser ?? ''}`}
        accessibilityHint={t('fork.go')}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          borderRadius: metrics.radius.card,
          borderCurve: 'continuous',
          backgroundColor: pressed ? sys.fill : sys.elevated,
          overflow: 'hidden',
          minHeight: 204,
          justifyContent: 'flex-end',
          paddingTop: 68,
        })}
      >
        <PlacePhoto
          image={img}
          name={poi.name}
          icon={interest ? INTEREST_ICON[interest] : 'map-pin'}
          showInfo={false}
          style={{ position: 'absolute', inset: 0 }}
        />
        <View style={{ padding: 12, gap: 4, backgroundColor: 'rgba(17,17,17,0.76)' }}>
          {interest ? <CategoryBadge interest={interest} /> : null}
          <Text variant="headline" color="#FFFFFF" numberOfLines={2}>
            {poi.name}
          </Text>
          <Text variant="footnote" color="#FFFFFF">
            {t('fork.walk', { minutes: Math.round(walkMinutes) })}
          </Text>
          {poi.partnerId ? (
            <Text
              variant="footnote"
              color="#FFFFFF"
            >{`${t('partner.adLabel')} · ${t('partner.label')}`}</Text>
          ) : null}
          {teaser ? (
            <Text variant="subheadline" color="#FFFFFF" numberOfLines={2}>
              {teaser}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      <PhotoInfo image={img} name={poi.name} />
    </View>
  );
}

import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { placeProminence, type Poi } from '@tuur/shared';
import { formatKm } from '../format';
import { useReduceMotion } from '../motion';
import { metrics, sys } from '../theme';
import { Icon } from './Icon';
import { CategoryBadge } from './category-badge';
import { PlacePhoto } from './PlacePhoto';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { INTEREST_ICON } from './icons';
import { interestOf } from './StopCards';
import { placeSummary } from './placeDetails';
import { PhotoInfo } from './photo-info';

export const PLACE_CARD_WIDTH = 320;

/**
 * A place with a photo and a play badge: tap it and tuur walks you there and tells its story. This is what makes the
 * app understandable at a glance (see a place, hear its story). Photos carry their Commons credit.
 */
export function PlaceCard({
  poi,
  minutes,
  onPress,
  navigate = false,
  disabled = false,
  width = PLACE_CARD_WIDTH,
  distanceM,
}: {
  poi: Poi;
  minutes?: number | undefined;
  onPress: () => void;
  navigate?: boolean;
  disabled?: boolean;
  width?: number;
  distanceM?: number;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const interest = interestOf(poi);
  const img = poi.imageRefs[0];
  const summary = placeSummary(poi, lang);
  const prominence = placeProminence(poi);
  const prominenceLabel = t(`home.placeProminence.${prominence}`);
  const walk = minutes === undefined ? undefined : t('home.placeWalk', { count: minutes });
  const distance =
    distanceM === undefined
      ? undefined
      : t('home.placeDistance', {
          distance:
            distanceM >= 1000
              ? `${formatKm(distanceM, lang)} km`
              : `${Math.max(0, Math.round(distanceM / 10) * 10)} m`,
        });
  const visit = t('home.placeVisit', { count: Math.max(1, Math.round(poi.dwellMinutes)) });
  const meta = [prominenceLabel, interest ? t(`interests.${interest}`) : undefined, walk, distance, visit]
    .filter(Boolean)
    .join('. ');
  return (
    <View
      style={{
        width,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: sys.elevated,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: sys.separator,
      }}
    >
      <PressableScale
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`${poi.name}. ${meta}${summary ? `. ${summary.text}` : ''}`}
        accessibilityHint={t(navigate ? 'home.roamTargetHint' : 'home.listenHint')}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={{ minHeight: 232, justifyContent: 'flex-end', paddingTop: 72 }}
      >
        <PlacePhoto
          image={img}
          name={poi.name}
          icon={interest ? INTEREST_ICON[interest] : 'map-marker-radius'}
          showInfo={false}
          style={{ position: 'absolute', inset: 0 }}
        />
        <View
          style={{
            padding: 14,
            gap: 7,
            backgroundColor: 'rgba(17,17,17,0.76)',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            {interest ? <CategoryBadge interest={interest} /> : null}
            <Icon name={prominence === 'landmark' ? 'star' : 'map-pin'} size={13} color="#FFFFFF" />
            <Text variant="caption" color="#FFFFFF" style={{ fontWeight: '600' }}>
              {prominenceLabel}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="headline" color="#FFFFFF" numberOfLines={2}>
                {poi.name}
              </Text>
              <Text variant="caption" color="#FFFFFF">
                {[walk, distance, visit].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: disabled ? sys.elevated : sys.accent,
              }}
            >
              <Icon
                name={navigate ? 'navigation' : 'play'}
                size={18}
                color={disabled ? sys.labelSecondary : sys.onAccent}
              />
            </View>
          </View>
          {summary ? (
            <Text variant="subheadline" color="#FFFFFF" numberOfLines={2}>
              {summary.text}
            </Text>
          ) : null}
          {poi.partnerId ? (
            <Text variant="caption" color="#FFFFFF">
              {t('partner.adLabel')}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      <PhotoInfo image={img} name={poi.name} summary={summary} />
    </View>
  );
}

/** Placeholder with the card's anatomy (photo block, title bars) that gently pulses while the places load. */
export function PlaceCardSkeleton() {
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);
  const bar = (w: `${number}%`) =>
    ({ height: 12, width: w, borderRadius: 6, backgroundColor: sys.fill }) as const;
  return (
    <Animated.View
      style={{
        width: PLACE_CARD_WIDTH,
        opacity: pulse,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: sys.elevated,
        overflow: 'hidden',
      }}
    >
      <View style={{ height: 150, backgroundColor: sys.fill }} />
      <View style={{ padding: 14, gap: 8, minHeight: 82 }}>
        <View style={bar('80%')} />
        <View style={bar('55%')} />
      </View>
    </Animated.View>
  );
}

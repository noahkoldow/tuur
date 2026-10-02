import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import type { Poi } from '@tuur/shared';
import { useReduceMotion } from '../motion';
import { metrics, sys } from '../theme';
import { Icon } from './Icon';
import { ImageCredit } from './ImageCredit';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { INTEREST_ICON } from './icons';
import { interestOf } from './StopCards';

export const PLACE_CARD_WIDTH = 232;

/**
 * A place with a photo and a play badge: tap it and tuur walks you there and tells its story. This is what makes the
 * app understandable at a glance (see a place, hear its story). Photos carry their Commons credit.
 */
export function PlaceCard({
  poi,
  minutes,
  onPress,
}: {
  poi: Poi;
  minutes?: number | undefined;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const interest = interestOf(poi);
  const img = poi.imageRefs[0];
  const meta = [
    interest ? t(`interests.${interest}`) : undefined,
    minutes === undefined ? undefined : t('common.minutes', { count: minutes }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableScale
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${poi.name}. ${meta}`}
      accessibilityHint={t('home.listenHint')}
      onPress={onPress}
      style={{
        width: PLACE_CARD_WIDTH,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: sys.elevated,
        overflow: 'hidden',
      }}
    >
      <View style={{ height: 144, backgroundColor: sys.accentTint }}>
        {img ? (
          <Image
            source={{ uri: img.thumbUrl ?? img.url }}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={250}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 36 }}>
            <Icon
              name={interest ? INTEREST_ICON[interest] : 'map-marker-radius'}
              size={48}
              color={sys.accentText}
            />
          </View>
        )}
        {img ? (
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              maxWidth: '62%',
              paddingHorizontal: 6,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.92)',
            }}
          >
            <ImageCredit image={img} />
          </View>
        ) : null}
        <View
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: 36,
            paddingLeft: 10,
            paddingRight: 14,
            borderRadius: 18,
            backgroundColor: sys.accent,
          }}
        >
          <Icon name="play" size={14} color={sys.onAccent} />
          <Text variant="subheadline" color={sys.onAccent} style={{ fontWeight: '600' }}>
            {t('home.listen')}
          </Text>
        </View>
      </View>
      <View style={{ padding: 12, gap: 2 }}>
        <Text variant="headline" numberOfLines={2} style={{ minHeight: 44 }}>
          {poi.name}
        </Text>
        <Text variant="footnote">{meta}</Text>
      </View>
    </PressableScale>
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
      <View style={{ height: 144, backgroundColor: sys.fill }} />
      <View style={{ padding: 12, gap: 8 }}>
        <View style={bar('80%')} />
        <View style={bar('55%')} />
      </View>
    </Animated.View>
  );
}

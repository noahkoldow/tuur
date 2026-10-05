import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { placeProminence, type Poi } from '@tuur/shared';
import { formatKm } from '../format';
import { useReduceMotion } from '../motion';
import { metrics, sys } from '../theme';
import { IconButton } from './Button';
import { FlipCard } from './flip-card';
import { Icon } from './Icon';
import { CategoryBadge } from './category-badge';
import { PlacePhoto } from './PlacePhoto';
import { Text } from './Text';
import { INTEREST_ICON } from './icons';
import { interestOf } from './StopCards';
import { placeInformation } from './placeDetails';
import { PhotoInfo } from './photo-info';

export const PLACE_CARD_WIDTH = 320;

/**
 * A photo card that flips to place information. Only the separate corner button chooses a destination.
 */
export function PlaceCard({
  poi,
  minutes,
  onNavigate,
  navigate = false,
  disabled = false,
  width = PLACE_CARD_WIDTH,
  distanceM,
  teaser,
}: {
  poi: Poi;
  minutes?: number | undefined;
  onNavigate: () => void;
  navigate?: boolean;
  disabled?: boolean;
  width?: number | '100%';
  distanceM?: number;
  teaser?: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const interest = interestOf(poi);
  const img = poi.imageRefs[0];
  const information = placeInformation(poi, lang);
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
    <FlipCard
      identity={poi.id}
      frontAccessibilityLabel={`${poi.name}. ${meta}`}
      style={{
        width,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: sys.elevated,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: sys.separator,
      }}
      frontStyle={{ minHeight: 232, justifyContent: 'flex-end', paddingTop: 72 }}
      front={
        <>
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
            <View style={{ gap: 4 }}>
              <Text variant="headline" color="#FFFFFF" numberOfLines={2}>
                {poi.name}
              </Text>
              <Text variant="caption" color="#FFFFFF">
                {[walk, distance, visit].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {poi.partnerId ? (
              <Text variant="caption" color="#FFFFFF">
                {t('partner.adLabel')}
              </Text>
            ) : null}
            <View style={{ minHeight: 44, paddingRight: 58, justifyContent: 'center' }}>
              <Text variant="caption" color="#FFFFFF">
                {t('cards.showInfo')}
              </Text>
            </View>
          </View>
        </>
      }
      back={
        <>
          <Text variant="caption" style={{ paddingRight: 44 }}>
            {t('stopInfo.title')}
          </Text>
          <Text variant="headline" style={{ paddingRight: 44 }}>
            {poi.name}
          </Text>
          {interest ? <CategoryBadge interest={interest} /> : null}
          <Text variant="footnote">
            {[prominenceLabel, walk, distance, visit].filter(Boolean).join(' · ')}
          </Text>
          {teaser ? <Text variant="body">{teaser}</Text> : null}
          {information ? (
            <Text variant="body">{information.text}</Text>
          ) : !teaser ? (
            <Text variant="subheadline">{t('cards.noInfo')}</Text>
          ) : null}
          {information ? <Text variant="caption">{t('cards.fromWikipedia')}</Text> : null}
          {poi.partnerId ? <Text variant="caption">{t('partner.adLabel')}</Text> : null}
        </>
      }
      overlay={
        <>
          <PhotoInfo image={img} name={poi.name} summary={information} />
          <View style={{ position: 'absolute', right: 12, bottom: 12 }}>
            <IconButton
              icon="navigation"
              primary
              label={t('cards.navigate', { name: poi.name })}
              hint={t(navigate ? 'home.roamTargetHint' : 'home.listenHint')}
              disabled={disabled}
              onPress={onNavigate}
            />
          </View>
        </>
      }
    />
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

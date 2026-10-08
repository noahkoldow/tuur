import { useEffect, useRef } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { haversineMatrix, type LatLng, type Poi, type TravelMode } from '@tuur/shared';
import { useReduceMotion } from '../motion';
import { metrics, sys } from '../theme';
import { IconButton } from './Button';
import { PlaceCard } from './PlaceCard';
import { Text } from './Text';

/** Current stop → estimated journey → proposed stop. Only the proposed card's arrow commits it. */
export function DestinationPreview({
  current,
  poi,
  position,
  mode,
  revealed,
  disabled,
  onConfirm,
  onDismiss,
}: {
  current: React.ReactNode;
  poi: Poi;
  position: LatLng | undefined;
  mode: TravelMode;
  revealed: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const reduced = useReduceMotion();
  const scroll = useRef<ScrollView>(null);
  const cardWidth = Math.min(420, Math.max(180, width - 100));
  const cycling = mode === 'cycling';
  const minutes = position
    ? Math.max(1, Math.round(haversineMatrix([position, poi.location], cycling ? 'cycling-regular' : 'foot-walking').minutes[0]![1]!))
    : undefined;

  useEffect(() => {
    if (revealed) scroll.current?.scrollTo({ x: cardWidth, animated: !reduced });
  }, [revealed, cardWidth, reduced]);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: metrics.margin }}>
        <IconButton icon="x" label={t('player.closePlace')} onPress={onDismiss} />
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        snapToOffsets={[0, cardWidth]}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: metrics.margin, alignItems: 'center' }}
        onMomentumScrollEnd={(event) => {
          if (revealed && event.nativeEvent.contentOffset.x < cardWidth / 2) onDismiss();
        }}
      >
        <View style={{ width: cardWidth }}>{current}</View>
        <View style={{ width: 68, alignItems: 'center', gap: 10 }}>
          {minutes !== undefined ? (
            <Text variant="caption" align="center" style={{ fontVariant: ['tabular-nums'] }}>
              {`${cycling ? '🚲' : '🚶'}\n${t('plan.minutesShort', { count: minutes })}`}
            </Text>
          ) : null}
          <View accessible={false} style={{ flexDirection: 'row', gap: 5 }}>
            {[0, 1, 2].map((dot) => (
              <View key={dot} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: sys.labelTertiary }} />
            ))}
          </View>
        </View>
        <PlaceCard poi={poi} width={cardWidth} navigate disabled={disabled} onNavigate={onConfirm} />
      </ScrollView>
      {disabled ? <Text variant="footnote" style={{ paddingHorizontal: metrics.margin }}>{t('home.roamAfterStory')}</Text> : null}
    </View>
  );
}

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import { haptics } from '../motion';
import { colors } from '../theme';

const GAP = 12;

export interface SnapCarouselItem {
  key: string;
  /** Screen-reader name of the page (used by the tappable dots). */
  label: string;
  node: React.ReactNode;
}

export interface SnapCarouselHandle {
  scrollTo(index: number): void;
}

/**
 * Horizontal, snapping card carousel: the focused card is lifted, neighbours peek in slightly smaller. Runs on the
 * native driver; the dots below are tappable for users who do not swipe (accessibility).
 */
export const SnapCarousel = forwardRef<
  SnapCarouselHandle,
  { items: SnapCarouselItem[]; maxCardWidth?: number; peek?: number; onIndexChange?: (i: number) => void }
>(function SnapCarousel({ items, maxCardWidth = 420, peek = 28, onIndexChange }, ref) {
  const { width } = useWindowDimensions();
  const cardW = Math.min(width - peek * 2, maxCardWidth);
  const interval = cardW + GAP;
  const side = (width - cardW) / 2;
  const x = useRef(new Animated.Value(0)).current;
  const scroller = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);

  useImperativeHandle(ref, () => ({
    scrollTo: (i: number) => scroller.current?.scrollTo({ x: i * interval, animated: true }),
  }));

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.x / interval)));
      setActive((cur) => {
        if (cur !== i) {
          haptics.select();
          onIndexChange?.(i);
        }
        return i;
      });
    },
  });

  return (
    <View style={{ gap: 12 }}>
      <Animated.ScrollView
        ref={scroller}
        horizontal
        snapToInterval={interval}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: side, gap: GAP }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {items.map((m, i) => {
          const input = [(i - 1) * interval, i * interval, (i + 1) * interval];
          const scale = x.interpolate({
            inputRange: input,
            outputRange: [0.93, 1, 0.93],
            extrapolate: 'clamp',
          });
          const translateY = x.interpolate({
            inputRange: input,
            outputRange: [8, 0, 8],
            extrapolate: 'clamp',
          });
          const opacity = x.interpolate({
            inputRange: input,
            outputRange: [0.6, 1, 0.6],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={m.key}
              style={{ width: cardW, opacity, transform: [{ translateY }, { scale }] }}
            >
              {m.node}
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
      {items.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {items.map((m, i) => (
            <Pressable
              key={m.key}
              accessibilityRole="button"
              accessibilityLabel={m.label}
              accessibilityState={{ selected: i === active }}
              hitSlop={10}
              onPress={() => scroller.current?.scrollTo({ x: i * interval, animated: true })}
              style={{
                width: i === active ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === active ? colors.brand.red : colors.border,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

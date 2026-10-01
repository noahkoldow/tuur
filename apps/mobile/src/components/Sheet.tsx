import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { haptics, springs } from '../motion';
import { colors, radii } from '../theme';
import { shadow } from '../theme';

interface Props {
  /** Visible heights in px for each snap stop, ascending. */
  snapPoints: number[];
  initialIndex?: number;
  index?: number;
  onIndexChange?: (i: number) => void;
  children: React.ReactNode;
  handleLabel: string;
  /** Header rendered inside the draggable area (always visible). */
  header?: React.ReactNode;
  /** The content scroll view (e.g. to follow the transcript). */
  scrollRef?: React.RefObject<ScrollView | null>;
  /** The listener scrolled the content themselves. */
  onUserScroll?: () => void;
}

/**
 * Bottom sheet with snap points (drag or tap the handle). Content scrolls only when fully expanded so that
 * dragging the sheet and scrolling never fight each other.
 */
export function Sheet({
  snapPoints,
  initialIndex = 0,
  index,
  onIndexChange,
  children,
  handleLabel,
  header,
  scrollRef,
  onUserScroll,
}: Props) {
  const { height: screenH } = useWindowDimensions();
  const snaps = useMemo(() => snapPoints.map((s) => Math.min(s, screenH * 0.92)), [snapPoints, screenH]);
  const max = snaps[snaps.length - 1]!;
  const [current, setCurrent] = useState(index ?? initialIndex);
  const offset = useRef(new Animated.Value(max - snaps[index ?? initialIndex]!)).current;
  const startOffset = useRef(0);

  const snapTo = (i: number, velocity = 0) => {
    setCurrent((cur) => {
      if (cur !== i) haptics.select();
      return i;
    });
    onIndexChange?.(i);
    Animated.spring(offset, {
      toValue: max - snaps[i]!,
      velocity,
      useNativeDriver: true,
      ...springs.sheet,
    }).start();
  };
  useEffect(() => {
    if (index !== undefined && index !== current) snapTo(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          offset.stopAnimation((v) => (startOffset.current = v));
        },
        onPanResponderMove: (_, g) => {
          // rubber band beyond the outer snap points instead of a hard stop
          const raw = startOffset.current + g.dy;
          const lo = 0;
          const hi = max - snaps[0]!;
          offset.setValue(raw < lo ? lo + (raw - lo) * 0.25 : raw > hi ? hi + (raw - hi) * 0.25 : raw);
        },
        onPanResponderRelease: (_, g) => {
          const projected = startOffset.current + g.dy + g.vy * 220;
          const visible = max - projected;
          let best = 0;
          snaps.forEach((s, i) => {
            if (Math.abs(s - visible) < Math.abs(snaps[best]! - visible)) best = i;
          });
          snapTo(best, g.vy);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snaps, max],
  );

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: max,
          backgroundColor: colors.surface.base,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          transform: [{ translateY: offset }],
        },
        shadow.card,
      ]}
    >
      <View {...pan.panHandlers}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={handleLabel}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            snapTo(
              Math.max(
                0,
                Math.min(snaps.length - 1, current + (e.nativeEvent.actionName === 'increment' ? 1 : -1)),
              ),
            )
          }
          onPress={() => snapTo((current + 1) % snaps.length)}
          style={{ alignItems: 'center', paddingVertical: 10 }}
        >
          <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
        </Pressable>
        {header}
      </View>
      <ScrollView
        ref={scrollRef}
        onScrollBeginDrag={onUserScroll}
        // always scrollable: content below the header must stay reachable for screen-reader and switch users
        scrollEnabled
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

export { radii };

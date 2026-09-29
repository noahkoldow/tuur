import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
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
}: Props) {
  const { height: screenH } = useWindowDimensions();
  const snaps = useMemo(() => snapPoints.map((s) => Math.min(s, screenH * 0.92)), [snapPoints, screenH]);
  const max = snaps[snaps.length - 1]!;
  const [current, setCurrent] = useState(index ?? initialIndex);
  const offset = useRef(new Animated.Value(max - snaps[index ?? initialIndex]!)).current;
  const startOffset = useRef(0);

  const snapTo = (i: number) => {
    setCurrent(i);
    onIndexChange?.(i);
    Animated.spring(offset, {
      toValue: max - snaps[i]!,
      useNativeDriver: true,
      bounciness: 3,
      speed: 16,
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
        onPanResponderMove: (_, g) =>
          offset.setValue(Math.max(0, Math.min(max - snaps[0]!, startOffset.current + g.dy))),
        onPanResponderRelease: (_, g) => {
          const projected = startOffset.current + g.dy + g.vy * 120;
          const visible = max - projected;
          let best = 0;
          snaps.forEach((s, i) => {
            if (Math.abs(s - visible) < Math.abs(snaps[best]! - visible)) best = i;
          });
          snapTo(best);
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
        scrollEnabled={current === snaps.length - 1}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

export { radii };

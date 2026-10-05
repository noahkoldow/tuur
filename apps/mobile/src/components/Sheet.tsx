import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  View,
  useColorScheme,
  useWindowDimensions,
  type PanResponderCallbacks,
} from 'react-native';
import { haptics, springs, useReduceMotion } from '../motion';
import { Icon } from './Icon';
import { radii, sys } from '../theme';

interface Props {
  /** Visible heights in px for each snap stop, ascending. */
  snapPoints: number[];
  initialIndex?: number;
  index?: number;
  onIndexChange?: (i: number) => void;
  /** Measured visible height after header, safe-area and screen-size constraints (for map padding). */
  onVisibleHeightChange?: (height: number) => void;
  /** Entered the lowest detent; emitted together with its measured height, never on initial mount. */
  onCollapse?: () => void;
  children: React.ReactNode;
  handleLabel: string;
  /** Header rendered inside the draggable area (always visible). */
  header?: React.ReactNode;
  /** Decorative artwork may peek over the top without intercepting gestures. */
  decoration?: React.ReactNode;
  /** Map control that follows the sheet throughout dragging and settling. */
  floatingAction?: React.ReactNode;
  /** Clearance above the sheet; defaults to leaving space for its artwork. */
  floatingActionOffset?: number;
  /** Space for a home indicator or tab bar. */
  bottomInset?: number;
  /** The content scroll view (e.g. to follow the transcript). */
  scrollRef?: React.RefObject<ScrollView | null>;
  /** The listener scrolled the content themselves. */
  onUserScroll?: () => void;
  /** Sheet surface: `grouped` (default) suits list content, `plain` suits reading text. */
  tone?: 'grouped' | 'plain';
}

/**
 * Bottom sheet with snap points (drag or tap the handle). Swiping content expands the sheet before scrolling;
 * at its highest distinct height, content scrolls normally, including when Dynamic Type merges snap points.
 */
export function Sheet({
  snapPoints,
  initialIndex = 0,
  index,
  onIndexChange,
  onVisibleHeightChange,
  onCollapse,
  children,
  handleLabel,
  header,
  decoration,
  floatingAction,
  floatingActionOffset = decoration ? 72 : 16,
  bottomInset = 24,
  scrollRef,
  onUserScroll,
  tone = 'grouped',
}: Props) {
  const background = tone === 'grouped' ? sys.grouped : sys.background;
  const scheme = useColorScheme();
  const reduceMotion = useReduceMotion();
  const { height: screenH } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(44);
  const snapKey = snapPoints.join(',');
  const snaps = useMemo(
    () =>
      snapKey
        .split(',')
        .map(Number)
        .reduce<number[]>((values, s) => {
          const height = Math.min(Math.max(s, headerHeight + bottomInset + 24), screenH * 0.92);
          values.push(Math.max(values[values.length - 1] ?? 0, height));
          return values;
        }, []),
    [snapKey, screenH, headerHeight, bottomInset],
  );
  const max = snaps[snaps.length - 1]!;
  const initialSnap = Math.max(0, Math.min(index ?? initialIndex, snaps.length - 1));
  const [current, setCurrent] = useState(initialSnap);
  const offset = useRef(new Animated.Value(max - snaps[initialSnap]!)).current;
  const startOffset = useRef(0);
  const scrollY = useRef(0);
  const activeIndex = Math.max(0, Math.min(current, snaps.length - 1));
  const canExpand = snaps[activeIndex]! < max - 1;
  const canCollapse = snaps[activeIndex]! > snaps[0]! + 1;
  const visibleHeight = snaps[activeIndex]!;
  // Large accessibility text or landscape can make the header taller than the whole sheet.
  // In that case it must scroll with the body so even its last controls remain reachable.
  const scrollHeader = headerHeight + bottomInset + 24 > max;
  const previousIndex = useRef(activeIndex);

  useEffect(() => {
    onVisibleHeightChange?.(visibleHeight);
    const collapsed = activeIndex === 0 && previousIndex.current !== 0;
    previousIndex.current = activeIndex;
    // Batch the camera reset with the final map inset, including controlled collapses from a map tap.
    if (collapsed) onCollapse?.();
  }, [visibleHeight, activeIndex, onVisibleHeightChange, onCollapse]);

  const nextDistinctIndex = (direction: -1 | 1) => {
    for (let i = activeIndex + direction; i >= 0 && i < snaps.length; i += direction) {
      if (Math.abs(snaps[i]! - snaps[activeIndex]!) > 1) return i;
    }
    return activeIndex;
  };

  const snapTo = (requestedIndex: number, velocity = 0) => {
    const i = Math.max(0, Math.min(requestedIndex, snaps.length - 1));
    if (activeIndex !== i) haptics.select();
    setCurrent(i);
    onIndexChange?.(i);
    if (reduceMotion) {
      offset.stopAnimation();
      offset.setValue(max - snaps[i]!);
      return;
    }
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
  useEffect(() => {
    offset.stopAnimation();
    offset.setValue(max - snaps[Math.min(current, snaps.length - 1)]!);
    // Adjust to rotation, Dynamic Type and header changes without losing the selected detent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max, snaps, offset]);

  const pan = useMemo(
    () => {
      const handlers: PanResponderCallbacks = {
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
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
          let best = activeIndex;
          snaps.forEach((s, i) => {
            if (Math.abs(s - visible) < Math.abs(snaps[best]! - visible)) best = i;
          });
          snapTo(best, g.vy);
        },
        onPanResponderTerminate: () => snapTo(current),
      };
      return {
        header: PanResponder.create(handlers),
        content: PanResponder.create({
          ...handlers,
          onMoveShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponderCapture: (_, g) =>
            Math.abs(g.dy) > 10 &&
            Math.abs(g.dy) > Math.abs(g.dx) * 1.4 &&
            ((g.dy < 0 && canExpand) || (g.dy > 0 && scrollY.current <= 0 && canCollapse)),
        }),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snaps, max, current, activeIndex, canExpand, canCollapse, reduceMotion, onIndexChange],
  );
  const headerContent = (
    <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height + 44)}>{header}</View>
  );

  return (
    <>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: max,
            backgroundColor: background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderCurve: 'continuous',
            borderTopWidth: 0.5,
            borderTopColor: sys.separator,
            transform: [{ translateY: offset }],
            shadowColor: '#000',
            shadowOpacity: scheme === 'dark' ? 0.5 : 0.14,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: -4 },
            elevation: 12,
          },
        ]}
      >
        {decoration ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: -58, right: 22 }}>
            {decoration}
          </View>
        ) : null}
        <View {...pan.header.panHandlers}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel={handleLabel}
            accessibilityValue={{ min: 0, max: snaps.length - 1, now: activeIndex }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) =>
              snapTo(nextDistinctIndex(e.nativeEvent.actionName === 'increment' ? 1 : -1))
            }
            onPress={() => snapTo(canExpand ? nextDistinctIndex(1) : 0)}
            style={{ alignItems: 'center', justifyContent: 'center', minHeight: 44 }}
          >
            <View
              style={{
                width: 36,
                height: 5,
                borderRadius: 3,
                backgroundColor: sys.labelTertiary,
                opacity: 0.6,
              }}
            />
            <View style={{ position: 'absolute', left: 16 }}>
              <Icon name={canExpand ? 'chevron-up' : 'chevron-down'} size={18} color={sys.labelSecondary} />
            </View>
          </Pressable>
          {scrollHeader ? null : headerContent}
        </View>
        <View style={{ flex: 1 }} {...pan.content.panHandlers}>
          <ScrollView
            ref={scrollRef}
            onScrollBeginDrag={onUserScroll}
            onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
            // always scrollable: content below the header must stay reachable for screen-reader and switch users
            scrollEnabled
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: max - snaps[activeIndex]! + bottomInset + 24,
            }}
            scrollIndicatorInsets={{ bottom: max - snaps[activeIndex]! + bottomInset }}
            showsVerticalScrollIndicator
          >
            {scrollHeader ? <View style={{ marginHorizontal: -16 }}>{headerContent}</View> : null}
            {children}
          </ScrollView>
        </View>
      </Animated.View>
      {floatingAction ? (
        <Animated.View
          style={{
            position: 'absolute',
            right: 16,
            bottom: max + floatingActionOffset,
            transform: [{ translateY: offset }],
          }}
        >
          {floatingAction}
        </Animated.View>
      ) : null}
    </>
  );
}

export { radii };

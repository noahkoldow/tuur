import { useEffect, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { useReduceMotion } from '../motion';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const gold = '#B68A32';
const highlights = [
  { fraction: 0.2, color: '#D4AA51' },
  { fraction: 0.14, color: '#E9C56E' },
  { fraction: 0.09, color: '#F7DFA0' },
  { fraction: 0.045, color: '#FFF4D1' },
] as const;

/** A decorative capsule border. The child remains the sole accessible, tappable control. */
export function GoldShimmer({
  children,
  active,
  disabled = false,
}: {
  children: ReactNode;
  active: boolean;
  disabled?: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const progress = useSharedValue(0);
  const animate = active && foreground && !reduceMotion && !disabled && width > 0 && height > 0;
  // A capsule: two straight sides and two semicircles, inset to leave room for the stroke.
  const radius = Math.max(0, Math.min(width, height) - 3) / 2;
  const perimeter = 2 * Math.abs(width - height) + 2 * Math.PI * radius;
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: -progress.get() * perimeter }));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(progress);
    if (animate) {
      progress.set(0);
      progress.set(
        withRepeat(
          withTiming(1, { duration: 6500, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
          -1,
          false,
        ),
      );
    }
    return () => cancelAnimation(progress);
  }, [animate, progress]);

  const rect = { x: 1.5, y: 1.5, width: Math.max(0, width - 3), height: Math.max(0, height - 3) };
  return (
    <View
      onLayout={({ nativeEvent: { layout } }) => {
        setSize((previous) =>
          previous.width === layout.width && previous.height === layout.height
            ? previous
            : { width: layout.width, height: layout.height },
        );
      }}
    >
      {children}
      {width > 0 && height > 0 ? (
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { opacity: disabled ? 0.4 : 1 }]}
        >
          <Svg width={width} height={height}>
            <Rect {...rect} rx={radius} fill="none" stroke={gold} strokeWidth={1.5} />
            {animate
              ? highlights.map(({ fraction, color }) => (
                  <AnimatedRect
                    key={color}
                    {...rect}
                    rx={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeDasharray={[perimeter * fraction, perimeter * (1 - fraction)]}
                    animatedProps={animatedProps}
                  />
                ))
              : null}
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

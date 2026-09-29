import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MARK_ASPECT_RATIO, MARK_PATH, MARK_VIEWBOX, colors } from '@tuur/ui';

interface Props {
  size?: number;
  label: string;
  color?: string;
}

/** Brand loader: the heart-pin mark turning around its own vertical axis. Static under reduced motion. */
export function SpinningMark({ size = 72, label, color = colors.brand.red }: Props) {
  const turn = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      turn.setValue(0);
    };
  }, [reduceMotion, turn]);

  const rotateY = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const width = MARK_ASPECT_RATIO > 1 ? size : size * MARK_ASPECT_RATIO;
  const height = MARK_ASPECT_RATIO > 1 ? size / MARK_ASPECT_RATIO : size;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={{ transform: [{ perspective: 600 }, { rotateY }] }}>
        <Svg width={width} height={height} viewBox={MARK_VIEWBOX}>
          <Path d={MARK_PATH} fill={color} fillRule="evenodd" />
        </Svg>
      </Animated.View>
    </View>
  );
}

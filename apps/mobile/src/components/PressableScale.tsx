import { useRef, useState } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { springs, useReduceMotion } from '../motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  /** Scale while pressed (buttons .97, cards .98, round icon buttons .92). */
  scaleTo?: number;
  style?: StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);
};

/**
 * Pressable with a spring "give" on touch (native driver). Under "reduce motion" only the colour feedback of the
 * style function remains.
 */
export function PressableScale({ scaleTo = 0.97, style, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const reduce = useReduceMotion();
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        if (!reduce)
          Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, ...springs.pressIn }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...springs.pressOut }).start();
        onPressOut?.(e);
      }}
      style={[resolved, { transform: [{ scale }] }]}
    />
  );
}

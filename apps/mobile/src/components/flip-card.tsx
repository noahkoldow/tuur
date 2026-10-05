import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { cubicBezier } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useReduceMotion } from '../motion';
import { sys } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

const FLIP_EASING = cubicBezier(0.77, 0, 0.175, 1);

interface FlipCardProps {
  identity: string;
  front: ReactNode;
  back: ReactNode;
  frontAccessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  frontStyle?: StyleProp<ViewStyle>;
  /** Padding and spacing for the scrollable information, above the return button. */
  backStyle?: StyleProp<ViewStyle>;
  /** Independent controls such as navigation or photo attribution, above both faces. */
  overlay?: ReactNode;
}

/** A new place always starts on its photo, including when a carousel reuses this component. */
export function FlipCard({ identity, ...props }: FlipCardProps) {
  return <FlipCardFaces key={identity} {...props} />;
}

function FlipCardFaces({
  front,
  back,
  frontAccessibilityLabel,
  style,
  frontStyle,
  backStyle,
  overlay,
}: Omit<FlipCardProps, 'identity'>) {
  const { t } = useTranslation();
  const reduced = useReduceMotion();
  const [flipped, setFlipped] = useState(false);
  const frontButton = useRef<View>(null);
  const backButton = useRef<View>(null);
  const transferFocus = useRef(false);
  const toggle = (event: GestureResponderEvent) => {
    if (Platform.OS === 'web') {
      // RN web passes either a DOM keyup or a React click event to onPress.
      const activation = (event.nativeEvent ?? event) as { key?: string; type?: string; detail?: number };
      transferFocus.current =
        activation.key === 'Enter' ||
        activation.key === ' ' ||
        activation.key === 'Spacebar' ||
        (activation.type === 'click' && activation.detail === 0);
      // Do this before aria-hidden changes so focus never remains in the hidden face.
      (flipped ? backButton.current : frontButton.current)?.blur();
    }
    setFlipped((value) => !value);
  };
  useLayoutEffect(() => {
    if (!transferFocus.current) return;
    transferFocus.current = false;
    (flipped ? backButton.current : frontButton.current)?.focus();
  }, [flipped]);

  return (
    <View style={style}>
      <Animated.View
        pointerEvents={flipped ? 'none' : 'auto'}
        accessibilityElementsHidden={flipped}
        importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
        aria-hidden={flipped}
        style={{
          backfaceVisibility: 'hidden',
          opacity: reduced && flipped ? 0 : 1,
          transform: [{ perspective: 1000 }, { rotateY: reduced || !flipped ? '0deg' : '180deg' }],
          transitionProperty: reduced ? 'opacity' : 'transform',
          transitionDuration: reduced ? 100 : 140,
          transitionTimingFunction: FLIP_EASING,
        }}
      >
        <Pressable
          ref={frontButton}
          accessibilityRole="button"
          accessibilityLabel={frontAccessibilityLabel}
          accessibilityHint={t('cards.showInfo')}
          accessibilityState={{ expanded: flipped }}
          disabled={flipped}
          onPress={toggle}
          pressRetentionOffset={12}
          style={frontStyle}
        >
          {front}
        </Pressable>
      </Animated.View>
      <Animated.View
        pointerEvents={flipped ? 'auto' : 'none'}
        accessibilityElementsHidden={!flipped}
        importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
        aria-hidden={!flipped}
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: sys.elevated,
            backfaceVisibility: 'hidden',
            opacity: reduced && !flipped ? 0 : 1,
            transform: [{ perspective: 1000 }, { rotateY: reduced || flipped ? '0deg' : '-180deg' }],
            transitionProperty: reduced ? 'opacity' : 'transform',
            transitionDuration: reduced ? 100 : 140,
            transitionTimingFunction: FLIP_EASING,
          },
        ]}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          nestedScrollEnabled
          directionalLockEnabled
        >
          <Pressable
            accessible={false}
            focusable={false}
            disabled={!flipped}
            onPress={toggle}
            style={[{ flexGrow: 1, padding: 16, gap: 10 }, backStyle]}
          >
            {back}
          </Pressable>
        </ScrollView>
        <Pressable
          ref={backButton}
          accessibilityRole="button"
          accessibilityLabel={t('cards.showPhoto')}
          disabled={!flipped}
          onPress={toggle}
          pressRetentionOffset={12}
          style={({ pressed }) => ({
            minHeight: 56,
            paddingVertical: 10,
            paddingLeft: 16,
            paddingRight: 72,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: pressed ? sys.fill : sys.elevated,
          })}
        >
          <Icon name="rotate-ccw" size={15} color={sys.accentText} />
          <Text variant="caption" color={sys.accentText} style={{ flexShrink: 1, fontWeight: '600' }}>
            {t('cards.showPhoto')}
          </Text>
        </Pressable>
      </Animated.View>
      {overlay ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {overlay}
        </View>
      ) : null}
    </View>
  );
}

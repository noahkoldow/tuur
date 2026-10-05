import { useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ReduceMotion } from 'react-native-reanimated';
import { sys } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Swipe reveals a destructive action; the persistent button also works without a gesture. */
export function SwipeDeleteRow({
  children,
  label,
  accessibilityLabel,
  onDelete,
}: {
  children: ReactNode;
  label: string;
  accessibilityLabel: string;
  onDelete: () => void;
}) {
  const swipeable = useRef<SwipeableMethods>(null);
  const [open, setOpen] = useState(false);
  const requestDelete = () => {
    swipeable.current?.close();
    onDelete();
  };

  return (
    <Swipeable
      ref={swipeable}
      enableTrackpadTwoFingerGesture
      overshootFriction={8}
      animationOptions={{ duration: 400, dampingRatio: 1, reduceMotion: ReduceMotion.System }}
      onSwipeableWillOpen={() => setOpen(true)}
      onSwipeableClose={() => setOpen(false)}
      renderRightActions={() => (
        <View
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={requestDelete}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 104,
              minHeight: 48,
              padding: 16,
              gap: 4,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sys.error,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Icon name="trash-2" size={20} color={sys.onAccent} />
            <Text variant="label" color={sys.onAccent}>
              {label}
            </Text>
          </Pressable>
        </View>
      )}
    >
      <View style={{ flexDirection: 'row', alignItems: 'stretch', backgroundColor: sys.elevated }}>
        <View style={{ flex: 1 }}>{children}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={requestDelete}
          style={({ pressed }) => ({
            minWidth: 48,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? sys.fill : undefined,
          })}
        >
          <Icon name="trash-2" size={18} color={sys.error} />
        </Pressable>
      </View>
    </Swipeable>
  );
}

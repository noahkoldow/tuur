import { View, type StyleProp, type ViewStyle } from 'react-native';
import { HIT, shadow, sys } from '../theme';
import { Glass } from './Glass';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { SpinningMark } from './SpinningMark';
import { Text } from './Text';

type Variant = 'primary' | 'tinted' | 'secondary' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  /**
   * primary = filled accent (the single most likely action in a view), tinted = accent text on a light accent wash,
   * secondary = gray fill, ghost = plain text (buttons.md: use style, not size, to rank choices).
   */
  variant?: Variant;
  /** `regular` is a 44 pt control for dense places such as cards and sheets. */
  size?: 'large' | 'regular';
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Capsule button with a press state, an in-button activity indicator while it works and at least 44 pt of height. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  icon,
  loading,
  disabled,
  accessibilityHint,
  style,
  testID,
}: Props) {
  const fg = variant === 'primary' ? sys.onAccent : variant === 'secondary' ? sys.label : sys.accentText;
  const bg =
    variant === 'primary'
      ? sys.accent
      : variant === 'tinted'
        ? sys.accentTint
        : variant === 'secondary'
          ? sys.fill
          : 'transparent';
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: size === 'large' ? 50 : HIT,
          borderRadius: 999,
          paddingHorizontal: size === 'large' ? 24 : 18,
          paddingVertical: 10,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          backgroundColor: bg,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <SpinningMark size={20} label={label} color={variant === 'primary' ? '#FFFFFF' : undefined} />
      ) : icon ? (
        <Icon name={icon} size={18} color={fg} weight="semibold" />
      ) : null}
      <Text variant="headline" color={fg} align="center" style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * Round icon button (44 pt by default). `onMap` puts it on Liquid Glass because it floats over the map; the other
 * variants are flat fills. Always pass a `label`: it is the only thing a screen reader announces.
 */
export function IconButton({
  icon,
  label,
  onPress,
  size = HIT,
  primary,
  disabled,
  onMap,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  size?: number;
  primary?: boolean;
  disabled?: boolean;
  /** Floats over a map: glass material instead of a flat fill. */
  onMap?: boolean;
}) {
  const glyph = (
    <Icon
      name={icon}
      size={Math.round(size * 0.46)}
      color={primary ? sys.onAccent : sys.label}
      weight="semibold"
    />
  );
  const button = (
    <PressableScale
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={Math.max(0, (HIT - size) / 2)}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? sys.accent : onMap ? 'transparent' : sys.fill,
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      {glyph}
    </PressableScale>
  );
  if (!onMap) return button;
  return (
    <Glass interactive style={{ width: size, height: size, borderRadius: size / 2, ...shadow.card }}>
      {button}
    </Glass>
  );
}

export function Row({
  children,
  gap = 12,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

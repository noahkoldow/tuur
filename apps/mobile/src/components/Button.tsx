import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HIT, colors, fonts, radii } from '../theme';
import { colors as palette, shadow } from '../theme';
import { PressableScale } from './PressableScale';
import { SpinningMark } from './SpinningMark';
import { Text } from './Text';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Primary buttons are brand red with large bold white text (allowed by AA for large text, spec 2.2) and switch to
 * `redPressed` while pressed.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  accessibilityHint,
  style,
  testID,
}: Props) {
  const isPrimary = variant === 'primary';
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
          minHeight: HIT + 4,
          borderRadius: radii.lg,
          paddingHorizontal: 22,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
          backgroundColor: isPrimary
            ? pressed
              ? colors.brand.redPressed
              : colors.brand.red
            : variant === 'secondary'
              ? pressed
                ? colors.surface.subtle
                : colors.surface.base
              : 'transparent',
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          borderColor: colors.border,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <>
          <SpinningMark size={22} label={label} color={isPrimary ? '#FFFFFF' : colors.brand.red} />
          <Text
            style={{
              fontFamily: fonts.heading,
              fontSize: isPrimary ? 18 : 16,
              lineHeight: 22,
              color: isPrimary ? '#fff' : variant === 'ghost' ? colors.brand.redPressed : colors.ink.primary,
            }}
          >
            {label}
          </Text>
        </>
      ) : (
        <>
          {icon ? <Feather name={icon} size={20} color={isPrimary ? '#fff' : colors.ink.primary} /> : null}
          <Text
            style={{
              fontFamily: fonts.heading,
              fontSize: isPrimary ? 18 : 16,
              lineHeight: 22,
              color: isPrimary ? '#fff' : variant === 'ghost' ? colors.brand.redPressed : colors.ink.primary,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 52,
  primary,
  disabled,
  onMap,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  size?: number;
  primary?: boolean;
  disabled?: boolean;
  /** Floating over a map: white with shadow so it stays visible on any map background. */
  onMap?: boolean;
}) {
  return (
    <PressableScale
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary
          ? pressed
            ? colors.brand.redPressed
            : colors.brand.red
          : onMap
            ? pressed
              ? palette.surface.subtle
              : palette.surface.base
            : pressed
              ? colors.border
              : colors.surface.subtle,
        ...(onMap ? shadow.card : null),
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Feather name={icon} size={size * 0.42} color={primary ? '#fff' : colors.ink.primary} />
    </PressableScale>
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

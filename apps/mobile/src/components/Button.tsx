import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HIT, colors, fonts, radii } from '../theme';
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
    <Pressable
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
        <ActivityIndicator color={isPrimary ? '#fff' : colors.brand.red} />
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
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 52,
  primary,
  disabled,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  size?: number;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
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
          : pressed
            ? colors.border
            : colors.surface.subtle,
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Feather name={icon} size={size * 0.42} color={primary ? '#fff' : colors.ink.primary} />
    </Pressable>
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

import { Text as RNText, type ColorValue, type TextProps as RNTextProps } from 'react-native';
import { type } from '../theme';

type Variant = keyof typeof type;
interface Props extends RNTextProps {
  variant?: Variant;
  color?: ColorValue;
  align?: 'left' | 'center' | 'right';
}

/**
 * Themed text using the iOS text styles. It follows the system text size (Dynamic Type, including the accessibility
 * sizes) and only stops at 2.3x, so layouts must wrap or grow instead of clipping (typography.md).
 */
export function Text({ variant = 'body', color, align, style, ...rest }: Props) {
  return (
    <RNText
      maxFontSizeMultiplier={2.3}
      {...rest}
      style={[type[variant], color ? { color } : null, align ? { textAlign: align } : null, style]}
    />
  );
}

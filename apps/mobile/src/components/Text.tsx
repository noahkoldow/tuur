import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { type } from '../theme';

type Variant = keyof typeof type;
interface Props extends RNTextProps {
  variant?: Variant;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** Themed text; scales with the system font size but caps at 1.6x so layouts stay intact (accessibility). */
export function Text({ variant = 'body', color, align, style, ...rest }: Props) {
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[type[variant], color ? { color } : null, align ? { textAlign: align } : null, style]}
    />
  );
}

import { View } from 'react-native';
import { metrics, sys } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Notices use symbol + text (never color alone) and status colors distinct from the brand red. */
export function Banner({
  text,
  tone = 'info',
  icon,
}: {
  text: string;
  tone?: 'info' | 'warning' | 'error';
  icon?: string;
}) {
  const fg = tone === 'error' ? sys.error : tone === 'warning' ? sys.warning : sys.labelSecondary;
  const glyph = icon ?? (tone === 'error' ? 'alert-octagon' : tone === 'warning' ? 'alert-triangle' : 'info');
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: 10,
        padding: 14,
        borderRadius: metrics.radius.row + 4,
        borderCurve: 'continuous',
        backgroundColor: sys.elevated,
        alignItems: 'flex-start',
      }}
    >
      <Icon name={glyph} size={20} color={fg} />
      <Text variant="subheadline" color={sys.label} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radii } from '../theme';
import { Text } from './Text';

/** Notices use icon + text (never colour alone) and status colours distinct from the brand red (spec 2.2). */
export function Banner({
  text,
  tone = 'info',
  icon,
}: {
  text: string;
  tone?: 'info' | 'warning' | 'error';
  icon?: keyof typeof Feather.glyphMap;
}) {
  const fg =
    tone === 'error'
      ? colors.status.error
      : tone === 'warning'
        ? colors.status.warning
        : colors.ink.secondary;
  const glyph = icon ?? (tone === 'error' ? 'alert-octagon' : tone === 'warning' ? 'alert-triangle' : 'info');
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: 10,
        padding: 12,
        borderRadius: radii.md,
        backgroundColor: colors.surface.subtle,
        alignItems: 'flex-start',
      }}
    >
      <Feather name={glyph} size={20} color={fg} />
      <Text variant="bodySecondary" style={{ flex: 1, color: colors.ink.primary }}>
        {text}
      </Text>
    </View>
  );
}

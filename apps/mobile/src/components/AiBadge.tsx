import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme';
import { Text } from './Text';

/** Marks AI-generated content (spec 10). */
export function AiBadge({ text }: { text?: string }) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityLabel={text ?? t('player.aiGenerated')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Feather name="cpu" size={14} color={colors.ink.secondary} />
      <Text variant="caption" style={{ flexShrink: 1 }}>
        {text ?? t('player.aiGenerated')}
      </Text>
    </View>
  );
}

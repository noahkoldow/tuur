import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { sys } from '../theme';
import { Icon } from './Icon';
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
      <Icon name="cpu" size={14} color={sys.labelSecondary} />
      <Text variant="footnote" style={{ flexShrink: 1 }}>
        {text ?? t('player.aiGenerated')}
      </Text>
    </View>
  );
}

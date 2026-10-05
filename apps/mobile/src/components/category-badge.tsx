import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Interest } from '@tuur/shared';
import { categoryColors, radii, spacing } from '../theme';
import { Icon } from './Icon';
import { INTEREST_ICON } from './icons';
import { Text } from './Text';

/** Category color always travels with its name and glyph, including over photos. */
export function CategoryBadge({ interest }: { interest: Interest }) {
  const { t } = useTranslation();
  const tone = categoryColors[interest];
  const label = t(`interests.${interest}`);
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radii.pill,
        backgroundColor: tone.background,
      }}
    >
      <Icon name={INTEREST_ICON[interest]} size={14} color={tone.foreground} />
      <Text variant="caption" color={tone.foreground} style={{ flexShrink: 1, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

import { haptics } from '../motion';
import type { Interest } from '@tuur/shared';
import { categoryColors, sys } from '../theme';
import { Icon } from './Icon';
import { INTEREST_ICON } from './icons';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/**
 * Selectable capsule (44 pt). Selection is shown with a checkmark and the tint, not by color alone, and the label
 * stays AA on the tint (accentText).
 */
export function Chip({
  label,
  selected,
  onPress,
  interest,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  interest?: Interest;
}) {
  const tone = interest ? categoryColors[interest] : undefined;
  const foreground = tone?.foreground ?? (selected ? sys.accentText : sys.label);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      onPress={
        onPress
          ? () => {
              haptics.select();
              onPress();
            }
          : undefined
      }
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        borderWidth: tone ? 1.5 : 0,
        borderColor: selected ? foreground : 'transparent',
        backgroundColor: tone?.background ?? (selected ? sys.accentTint : sys.fill),
        maxWidth: '100%',
      }}
    >
      {interest ? <Icon name={INTEREST_ICON[interest]} size={16} color={foreground} /> : null}
      <Text variant="subheadline" style={{ flexShrink: 1, fontWeight: '600', color: foreground }}>
        {label}
      </Text>
      {selected ? <Icon name="check" size={14} color={foreground} weight="bold" /> : null}
    </PressableScale>
  );
}

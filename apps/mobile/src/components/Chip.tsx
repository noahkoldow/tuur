import { haptics } from '../motion';
import { sys } from '../theme';
import { Icon } from './Icon';
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
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
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
        backgroundColor: selected ? sys.accentTint : sys.fill,
      }}
    >
      {selected ? <Icon name="check" size={14} color={sys.accentText} weight="bold" /> : null}
      <Text variant="subheadline" style={{ fontWeight: '600', color: selected ? sys.accentText : sys.label }}>
        {label}
      </Text>
    </PressableScale>
  );
}

import { haptics } from '../motion';
import { PressableScale } from './PressableScale';
import { colors, fonts, radii } from '../theme';
import { Text } from './Text';

/** Selectable chip. Selected uses the brand tint with `redPressed` text (AA on tint), never bare brand red for small text. */
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
        justifyContent: 'center',
        borderRadius: radii.pill,
        backgroundColor: selected ? colors.brand.redTint : colors.surface.subtle,
        borderWidth: 1.5,
        borderColor: selected ? colors.brand.red : 'transparent',
      }}
    >
      <Text
        style={{
          fontFamily: fonts.headingMedium,
          fontSize: 15,
          color: selected ? colors.brand.redPressed : colors.ink.primary,
        }}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

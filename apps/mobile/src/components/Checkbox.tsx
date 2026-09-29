import { Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';
import { Text } from './Text';

/** Labeled checkbox with a 44 pt tap target; state is conveyed by icon and accessibility state, not colour alone. */
export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 44, paddingVertical: 4 }}
    >
      <Pressable
        accessible={false}
        onPress={() => onChange(!checked)}
        style={{
          width: 26,
          height: 26,
          marginTop: 2,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: checked ? colors.brand.redPressed : colors.ink.secondary,
          backgroundColor: checked ? colors.brand.redPressed : colors.surface.base,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Feather name="check" size={18} color="#FFFFFF" /> : null}
      </Pressable>
      <Text variant="caption" style={{ flex: 1 }} color={colors.ink.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

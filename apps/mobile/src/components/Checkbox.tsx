import { Pressable } from 'react-native';
import { sys } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Labeled consent control with a 44 pt target; state is a filled/empty circle plus the accessibility state. */
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
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 44, paddingVertical: 6 }}
    >
      <Icon
        name={checked ? 'check-circle' : 'circle'}
        size={26}
        color={checked ? sys.accent : sys.labelTertiary}
        weight="regular"
      />
      <Text variant="footnote" style={{ flex: 1 }} color={sys.label}>
        {label}
      </Text>
    </Pressable>
  );
}

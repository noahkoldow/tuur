import { Pressable } from 'react-native';
import { sys } from '../theme';
import { Icon } from './Icon';

/** Navigation-bar button with a 44 pt target. Pass the accessibility label; the symbol alone says nothing. */
function HeaderButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={icon} size={icon === 'x' ? 18 : 20} color={sys.label} weight="semibold" />
    </Pressable>
  );
}

/** Dismisses a sheet (the swipe-down gesture still works; this is the visible way out). */
export const CloseButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <HeaderButton icon="x" label={label} onPress={onPress} />
);

/** Back button for flows that step through their own pages inside one route. */
export const BackButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <HeaderButton icon="arrow-left" label={label} onPress={onPress} />
);

/** Settings gear for a tab root's navigation bar. */
export const SettingsButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <HeaderButton icon="settings" label={label} onPress={onPress} />
);

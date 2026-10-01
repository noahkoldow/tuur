import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metrics } from '../theme';
import { Glass } from './Glass';

/**
 * The one primary action of a scrolling screen, floating on a glass capsule so it stays legible over content
 * (also while disabled) without a solid bar behind it (layout.md: differentiate controls from content).
 */
export function FloatingAction({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: metrics.margin, right: metrics.margin, bottom: insets.bottom + 8 }}
    >
      <Glass style={{ borderRadius: 28, padding: 6, gap: 4 }}>{children}</Glass>
    </View>
  );
}

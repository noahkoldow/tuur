import { View } from 'react-native';
import { colors } from '../theme';

/** Player progress: the red bar is one of the intended red accents (spec 2.2). */
export function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: height, backgroundColor: colors.border, overflow: 'hidden' }}
    >
      <View
        style={{ width: `${pct * 100}%`, height, borderRadius: height, backgroundColor: colors.brand.red }}
      />
    </View>
  );
}

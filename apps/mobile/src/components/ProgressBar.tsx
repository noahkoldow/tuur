import { View } from 'react-native';
import { sys } from '../theme';

/** Determinate progress (player, downloads): the accent bar is one of the intended uses of brand red. */
export function ProgressBar({ value, height = 4 }: { value: number; height?: number }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: height, backgroundColor: sys.fill, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height, backgroundColor: sys.accent }} />
    </View>
  );
}

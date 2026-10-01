import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { sys, shadow } from '../theme';

let reduceTransparency = false;
const listeners = new Set<(v: boolean) => void>();
void AccessibilityInfo.isReduceTransparencyEnabled?.()
  .then((v) => {
    reduceTransparency = v;
    listeners.forEach((l) => l(v));
  })
  .catch(() => undefined);
AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', (v: boolean) => {
  reduceTransparency = v;
  listeners.forEach((l) => l(v));
});

/** The system "Reduce Transparency" setting (liquid-glass.md: glass needs an opaque fallback). */
export function useReduceTransparency(): boolean {
  const [v, setV] = useState(reduceTransparency);
  useEffect(() => {
    listeners.add(setV);
    return () => void listeners.delete(setV);
  }, []);
  return v;
}

const supported = Platform.OS === 'ios' && safeAvailable();
function safeAvailable() {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

/**
 * Liquid Glass surface for the functional layer only: floating controls over the map, never cards or list rows
 * (liquid-glass.md). Without the material (before iOS 26, other platforms) or with Reduce Transparency on it is an
 * opaque elevated surface, so controls stay legible everywhere.
 */
export function Glass({
  children,
  style,
  interactive,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}) {
  const reduce = useReduceTransparency();
  if (supported && !reduce)
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} style={style}>
        {children}
      </GlassView>
    );
  return <View style={[{ backgroundColor: sys.elevated }, shadow.card, style]}>{children}</View>;
}

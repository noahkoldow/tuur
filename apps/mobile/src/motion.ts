import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

let reduceMotion = false;
const listeners = new Set<(v: boolean) => void>();
void AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceMotion = v;
    listeners.forEach((l) => l(v));
  })
  .catch(() => undefined);
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
  reduceMotion = v;
  listeners.forEach((l) => l(v));
});

/** The system "reduce motion" setting; springs and loops are skipped or shortened while it is on. */
export function useReduceMotion(): boolean {
  const [v, setV] = useState(reduceMotion);
  useEffect(() => {
    listeners.add(setV);
    return () => void listeners.delete(setV);
  }, []);
  return v;
}

export const isReduceMotion = () => reduceMotion;

/** Shared spring presets (RN Animated, native driver). */
export const springs = {
  /** Sheets and panels: settle quickly without wobble. */
  sheet: { damping: 26, stiffness: 240, mass: 1 },
  /** Press feedback. */
  pressIn: { speed: 40, bounciness: 0 },
  pressOut: { speed: 18, bounciness: 6 },
} as const;

const on = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (f: () => Promise<void>) => {
  if (on) void f().catch(() => undefined);
};

/** Haptic vocabulary of the app (no-op on web). Kept small so feedback stays meaningful. */
export const haptics = {
  /** Picking something: chips, carousel pages, sheet snaps, map pins. */
  select: () => safe(() => Haptics.selectionAsync()),
  /** Player controls. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Starting a tour. */
  start: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Arrival at a stop, badge, purchase, redemption. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Paused because of a vehicle, errors. */
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};

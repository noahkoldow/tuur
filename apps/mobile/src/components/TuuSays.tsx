import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  PixelRatio,
  Pressable,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useReduceMotion } from '../motion';
import { useSettings } from '../state/settings';
import { metrics, sys } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Mascot, type MascotPose } from './Mascot';
import { Text } from './Text';

/** The tip that claimed this app session: only that one shows again, so people meet at most one tip per session. */
let sessionTip: string | undefined;

/** One-time tips: visible until dismissed (or until tips are switched off in the settings). */
export function useTip(id: string | undefined) {
  const claim = useRef<boolean | undefined>(undefined);
  const hydrated = useSettings((s) => s.hydrated);
  const enabled = useSettings((s) => s.tipsEnabled);
  const seen = useSettings((s) => s.seenTips);
  const set = useSettings((s) => s.set);
  const eligible = id === undefined ? true : hydrated && enabled && !seen.includes(id);
  if (id !== undefined && eligible && claim.current === undefined) {
    claim.current = sessionTip === undefined || sessionTip === id;
    if (claim.current) sessionTip = id;
  }
  const visible = id === undefined ? true : eligible && claim.current === true;
  const dismiss = () => {
    if (id !== undefined && !seen.includes(id)) set({ seenTips: [...seen, id] });
  };
  return { visible, dismiss };
}

interface Props {
  pose: MascotPose;
  text: string;
  /** With an id the bubble is a one-time tip: it shows once, has a dismiss button and stays away afterwards. */
  tipId?: string;
  size?: number;
  /** Side Tuu stands on; the bubble tail points at Tuu. */
  side?: 'left' | 'right';
  /** Optional single action inside the bubble ("Show me"). */
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

/**
 * Tuu explains something in a speech bubble (D46). Use it where a screen needs one sentence of guidance; one-time
 * tips (`tipId`) teach through context instead of a tutorial (onboarding.md) and can be re-enabled in the settings.
 */
export function TuuSays({ pose, text, tipId, size = 72, side = 'left', action, style }: Props) {
  const { t } = useTranslation();
  const { visible, dismiss } = useTip(tipId);
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (!visible || reduce) return pop.setValue(1);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 7, tension: 70 }).start();
  }, [visible, reduce, pop]);
  // Announce the bubble once when it appears (iOS has no live regions); Tuu itself stays hidden from VoiceOver.
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const { width } = useWindowDimensions();
  if (!visible) return null;
  // Keep Tuu modest on small screens and at large Dynamic Type so the bubble keeps the room it needs to wrap.
  const fontScale = PixelRatio.getFontScale();
  const mascotSize = Math.round(
    Math.min(size, width * 0.2) * (fontScale > 1.3 ? 0.75 : 1) * (fontScale > 2 ? 0.8 : 1),
  );
  const left = side === 'left';
  const tail = (
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: 8,
        borderBottomWidth: 8,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        ...(left
          ? { borderRightWidth: 9, borderRightColor: sys.elevated }
          : { borderLeftWidth: 9, borderLeftColor: sys.elevated }),
        marginBottom: 14,
      }}
    />
  );
  return (
    <Animated.View
      style={[
        {
          flexDirection: left ? 'row' : 'row-reverse',
          alignItems: 'flex-end',
          gap: 2,
          opacity: pop,
          transform: [
            { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
        style,
      ]}
    >
      <Mascot pose={pose} size={mascotSize} idle={!reduce} />
      <View style={{ flex: 1, flexDirection: left ? 'row' : 'row-reverse', alignItems: 'flex-end' }}>
        {tail}
        <View
          style={{
            flex: 1,
            gap: 8,
            padding: 14,
            borderRadius: 20,
            borderCurve: 'continuous',
            backgroundColor: sys.elevated,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 2 },
          }}
        >
          <Text variant="subheadline" color={sys.label} accessibilityLiveRegion="polite">
            {text}
          </Text>
          {action || tipId ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'flex-end',
              }}
            >
              {action ? (
                <Button
                  variant="tinted"
                  size="regular"
                  label={action.label}
                  onPress={() => {
                    dismiss();
                    action.onPress();
                  }}
                />
              ) : null}
              {tipId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('tuu.dismiss')}
                  hitSlop={8}
                  onPress={dismiss}
                  style={{
                    minHeight: metrics.hit,
                    paddingHorizontal: 8,
                    justifyContent: 'center',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon name="check" size={14} color={sys.accentText} weight="bold" />
                  <Text variant="subheadline" color={sys.accentText} style={{ fontWeight: '600' }}>
                    {t('tuu.dismiss')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../motion';
import { radii, sys } from '../theme';
import { Icon } from './Icon';
import { MapActionTrigger } from './MapActionTrigger';
import type { MapActionsMenuProps } from './MapActionControls';
import { Text } from './Text';

/**
 * SDK 57 has no universal Menu, and Compose DropdownMenu cannot request upward placement.
 * A modal keeps this upward-anchored fallback above map surfaces. RN web's Modal supplies
 * Escape dismissal, focus trapping/restoration and aria-modal; Android supplies Back dismissal.
 */
export function MapActionsMenu({ onFindPause, onToggleTourPause, tourPaused }: MapActionsMenuProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const firstAction = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number }>();
  const close = () => setAnchor(undefined);
  // A window resize invalidates screen coordinates (rotation, split view and browser zoom).
  useEffect(() => setAnchor(undefined), [width, height]);

  const open = () => {
    if (Platform.OS === 'web') trigger.current?.focus();
    trigger.current?.measureInWindow((x, y, measuredWidth) => {
      haptics.select();
      setAnchor({ x, y, width: measuredWidth });
    });
  };
  const select = (action: () => void) => {
    close();
    action();
  };
  const actions = [
    { key: 'findPause', label: t('mapActions.findPause'), icon: 'coffee', onPress: onFindPause },
    ...(onToggleTourPause
      ? [
          {
            key: 'toggleTour',
            label: t(tourPaused ? 'mapActions.resumeTour' : 'mapActions.pauseTour'),
            icon: tourPaused ? 'play' : 'pause',
            onPress: onToggleTourPause,
          },
        ]
      : []),
  ];

  return (
    <>
      <MapActionTrigger ref={trigger} open={Boolean(anchor)} onPress={open} />
      {anchor ? (
        <Modal
          transparent
          visible
          animationType="none"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={close}
          onShow={() => {
            if (Platform.OS === 'web') firstAction.current?.focus();
            else {
              const target = findNodeHandle(firstAction.current);
              if (target) AccessibilityInfo.setAccessibilityFocus(target);
            }
          }}
        >
          <View style={{ flex: 1 }} accessibilityViewIsModal>
            <Pressable
              testID="map-actions-backdrop"
              accessible={false}
              focusable={false}
              onPress={close}
              style={{ position: 'absolute', inset: 0 }}
            />
            <View
              testID="map-actions-menu"
              accessibilityLabel={t('mapActions.open')}
              onAccessibilityEscape={close}
              style={{
                position: 'absolute',
                right: Math.max(16, width - anchor.x - anchor.width),
                bottom: height - anchor.y + 8,
                width: Math.min(280, width - 32),
                maxHeight: Math.max(48, anchor.y - insets.top - 16),
                backgroundColor: sys.elevated,
                borderRadius: radii.md,
                borderCurve: 'continuous',
                borderWidth: 0.5,
                borderColor: sys.separator,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.18)',
                overflow: 'hidden',
              }}
            >
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 4 }}>
                {actions.map((action, index) => (
                  <Pressable
                    key={action.key}
                    ref={index === 0 ? firstAction : undefined}
                    testID={`map-action-${action.key}`}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    onPress={() => select(action.onPress)}
                    style={({ pressed }) => ({
                      minHeight: 52,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      backgroundColor: pressed ? sys.fill : 'transparent',
                    })}
                  >
                    <Icon name={action.icon} size={20} color={sys.label} />
                    <Text style={{ flex: 1 }}>{action.label}</Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={close}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderTopWidth: 0.5,
                    borderTopColor: sys.separator,
                    backgroundColor: pressed ? sys.fill : 'transparent',
                  })}
                >
                  <Text color={sys.labelSecondary}>{t('mapActions.close')}</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

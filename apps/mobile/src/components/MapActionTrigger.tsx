import type { Ref } from 'react';
import { Platform, Pressable, type View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { HIT, mapMarker, sys } from '../theme';
import { Glass } from './Glass';
import { Icon } from './Icon';

/** No scale or entrance motion: this frequently used control responds with a simple press tint. */
export function MapActionTrigger({
  open,
  onPress,
  ref,
}: {
  open: boolean;
  onPress: () => void;
  ref?: Ref<View>;
}) {
  const { t } = useTranslation();
  const size = Platform.OS === 'android' ? Math.max(48, HIT) : HIT;
  return (
    <Glass
      interactive
      style={{ width: size, height: size, borderRadius: size / 2, boxShadow: mapMarker.shadow }}
    >
      <Pressable
        ref={ref}
        testID="map-actions-trigger"
        accessibilityRole="button"
        accessibilityLabel={t('mapActions.open')}
        accessibilityState={{ expanded: open }}
        onPress={(event) => {
          event.stopPropagation();
          onPress();
        }}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed || open ? sys.fill : 'transparent',
        })}
      >
        <Icon name="more-horizontal" size={22} color={sys.label} weight="semibold" />
      </Pressable>
    </Glass>
  );
}

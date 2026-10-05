import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radii, shadow, sys } from '../theme';
import { Text } from './Text';
import { ROUTE_DONE_COLOR } from './mapTypes';

/** Line patterns as well as colours distinguish the walked trail from the route ahead. */
export function MapRouteLegend({
  walked,
  next,
  ahead,
  bottom,
}: {
  walked: boolean;
  next: boolean;
  ahead: boolean;
  bottom: number;
}) {
  const { t } = useTranslation();
  if (!walked && !next && !ahead) return null;
  const items = [
    ...(walked
      ? [{ key: 'walked', label: t('map.walked', { defaultValue: 'Walked' }), color: ROUTE_DONE_COLOR }]
      : []),
    ...(next
      ? [{ key: 'next', label: t('map.next', { defaultValue: 'Next stop' }), color: colors.brand.red }]
      : []),
    ...(ahead
      ? [{ key: 'ahead', label: t('map.ahead', { defaultValue: 'Ahead' }), color: colors.brand.red }]
      : []),
  ];
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom,
        left: 16,
        maxWidth: '76%',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radii.md,
        backgroundColor: sys.elevated,
        ...shadow.card,
      }}
    >
      {items.map((item) => (
        <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 17,
              borderTopWidth: item.key === 'next' ? 4 : 3,
              borderColor: item.color,
              borderStyle: item.key === 'ahead' ? 'dashed' : 'solid',
              opacity: item.key === 'ahead' ? 0.65 : 1,
            }}
          />
          <Text variant="caption" color={sys.label}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

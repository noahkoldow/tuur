import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TravelMode } from '@tuur/shared';
import { colors, radii, shadow } from '../theme';
import { TRAVEL_ICON } from './icons';
import { Text } from './Text';

/** Small, fixed-size pill with the travel mode the pacing engine currently assumes (stationary/walk/bike/vehicle). */
export function TravelModeChip({ mode }: { mode: TravelMode }) {
  const { t } = useTranslation();
  const label = t(`travel.${mode}`);
  return (
    <View
      accessible
      accessibilityLabel={t('travel.detected', { mode: label })}
      accessibilityLiveRegion="polite"
      style={{
        height: 32,
        minWidth: 96,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: radii.pill,
        backgroundColor: colors.surface.base,
        ...shadow.card,
      }}
    >
      <MaterialCommunityIcons name={TRAVEL_ICON[mode]} size={16} color={colors.ink.primary} />
      <Text variant="label" style={{ fontSize: 13 }}>
        {label}
      </Text>
    </View>
  );
}

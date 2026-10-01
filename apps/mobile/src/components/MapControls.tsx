import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, fonts, shadow } from '../theme';
import { Text } from './Text';
import { INTEREST_ICON } from './icons';
import type { MapSpot } from './mapTypes';

/** Google-Maps-style button: brings the camera back to the user; the map otherwise stays where the user pans it. */
export function LocateButton({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('map.locate')}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 16,
        bottom,
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surface.subtle : colors.surface.base,
        ...shadow.card,
      })}
    >
      <MaterialCommunityIcons name="crosshairs-gps" size={24} color={colors.brand.redPressed} />
    </Pressable>
  );
}

/** Size in px of a spot marker for its popularity scale. */
export const spotDiameter = (scale: number) => Math.round(26 + scale * 22);

/** Explored-by-others marker: round, category glyph, grows with popularity; hot spots are filled red with a flame. */
export function SpotMarker({ spot }: { spot: MapSpot }) {
  const d = spotDiameter(spot.scale);
  const glyph = spot.interest ? INTEREST_ICON[spot.interest] : 'map-marker-radius';
  return (
    <View
      style={{
        width: Math.max(44, d + 8),
        height: Math.max(44, d + 8),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: d,
          height: d,
          borderRadius: d / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: spot.hot ? colors.brand.red : colors.surface.base,
          borderWidth: 2,
          borderColor: spot.hot ? '#FFFFFF' : colors.brand.red,
          ...shadow.card,
        }}
      >
        <MaterialCommunityIcons
          name={glyph}
          size={Math.round(d * 0.5)}
          color={spot.hot ? '#FFFFFF' : colors.brand.redPressed}
        />
      </View>
      {spot.hot ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.surface.base,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name="fire" size={13} color={colors.brand.redPressed} />
        </View>
      ) : null}
    </View>
  );
}

/** Several explored spots that would overlap at this zoom: one bubble with the count; tap zooms in. */
export function ClusterMarker({ count, hot }: { count: number; hot: boolean }) {
  const d = Math.min(56, 34 + Math.log2(count) * 6);
  return (
    <View
      style={{
        width: Math.max(44, d + 8),
        height: Math.max(44, d + 8),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: d,
          height: d,
          borderRadius: d / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hot ? colors.brand.red : colors.surface.base,
          borderWidth: 2,
          borderColor: hot ? '#FFFFFF' : colors.brand.red,
          ...shadow.card,
        }}
      >
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: fonts.heading,
            fontSize: 15,
            color: hot ? '#FFFFFF' : colors.brand.redPressed,
          }}
        >
          {count}
        </Text>
      </View>
    </View>
  );
}

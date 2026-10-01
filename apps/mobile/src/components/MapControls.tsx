import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fonts, shadow, sys } from '../theme';
import { IconButton } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { INTEREST_ICON } from './icons';
import type { MapSpot } from './mapTypes';

/** Brings the camera back to the user; the map otherwise stays where the user pans it. Floats on glass. */
export function LocateButton({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  const { t } = useTranslation();
  return (
    <View style={{ position: 'absolute', right: 16, bottom }}>
      <IconButton onMap icon="navigation" label={t('map.locate')} onPress={onPress} />
    </View>
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
          backgroundColor: spot.hot ? sys.accent : sys.elevated,
          borderWidth: 2,
          borderColor: spot.hot ? '#FFFFFF' : sys.accent,
          ...shadow.card,
        }}
      >
        <Icon name={glyph} size={Math.round(d * 0.5)} color={spot.hot ? '#FFFFFF' : sys.accentText} />
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
            backgroundColor: sys.elevated,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="fire" size={12} color={sys.accentText} />
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
          backgroundColor: hot ? sys.accent : sys.elevated,
          borderWidth: 2,
          borderColor: hot ? '#FFFFFF' : sys.accent,
          ...shadow.card,
        }}
      >
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: fonts.heading,
            fontSize: 15,
            color: hot ? '#FFFFFF' : sys.accentText,
          }}
        >
          {count}
        </Text>
      </View>
    </View>
  );
}

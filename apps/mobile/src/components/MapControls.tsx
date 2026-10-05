import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { categoryColors, mapMarker, radii, sys } from '../theme';
import { IconButton } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { INTEREST_ICON } from './icons';
import type { MapSpot } from './mapTypes';

/** Restores the north-up, flat view at the default zoom and resumes following during navigation. */
export function LocateButton({ onPress, bottom }: { onPress: () => void; bottom?: number }) {
  const { t } = useTranslation();
  const button = <IconButton onMap icon="navigation" label={t('map.locate')} onPress={onPress} />;
  if (bottom === undefined) return button;
  return <View style={{ position: 'absolute', right: 16, bottom }}>{button}</View>;
}

/** Popularity changes visual size gently; every place keeps the same generous touch area. */
export const spotDiameter = (scale: number) =>
  Math.round(mapMarker.discMin + Math.min(1, Math.max(0, scale)) * (mapMarker.discMax - mapMarker.discMin));

export function SpotMarker({ spot }: { spot: MapSpot }) {
  const { t } = useTranslation();
  const d = spotDiameter(spot.scale);
  const glyph = spot.interest ? INTEREST_ICON[spot.interest] : 'map-pin';
  const tone = spot.interest ? categoryColors[spot.interest] : undefined;
  return (
    <View
      accessible
      accessibilityLabel={[spot.name, spot.interest ? t(`interests.${spot.interest}`) : undefined]
        .filter(Boolean)
        .join(', ')}
      style={{ width: mapMarker.hit, height: mapMarker.hit, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: d,
          height: d,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone?.background ?? (spot.hot ? sys.accentTint : sys.elevated),
          borderWidth: spot.hot ? 2 : 1,
          borderColor: tone?.foreground ?? (spot.hot ? sys.accentText : sys.separator),
          boxShadow: mapMarker.shadow,
        }}
      >
        <Icon
          name={glyph}
          size={mapMarker.icon}
          color={tone?.foreground ?? (spot.hot ? sys.accentText : sys.labelSecondary)}
          weight="semibold"
        />
      </View>
    </View>
  );
}

/** Nearby places share the stop capsule language, with a small collection glyph and readable count. */
export function ClusterMarker({ count, hot }: { count: number; hot: boolean }) {
  return (
    <View
      style={{
        minWidth: mapMarker.hit,
        minHeight: mapMarker.hit,
        paddingHorizontal: 4,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          height: mapMarker.currentHeight,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: mapMarker.gap,
          paddingHorizontal: mapMarker.inset,
          borderRadius: radii.pill,
          backgroundColor: hot ? sys.accentTint : sys.elevated,
          borderWidth: 1,
          borderColor: hot ? sys.accentText : sys.separator,
          boxShadow: mapMarker.shadow,
        }}
      >
        <Icon
          name="map-marker-radius"
          size={mapMarker.compactIcon}
          color={hot ? sys.accentText : sys.labelSecondary}
        />
        <Text
          variant="label"
          color={hot ? sys.accentText : sys.label}
          maxFontSizeMultiplier={1.2}
          style={{ fontVariant: ['tabular-nums'], fontWeight: '700' }}
        >
          {count > 999 ? '999+' : count}
        </Text>
      </View>
    </View>
  );
}

/** A shared location puck; a real heading arrow replaces the former rotating circular dot. */
export function UserPositionMarker({ heading, label }: { heading?: number | undefined; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        width: mapMarker.positionSize,
        height: mapMarker.positionSize,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radii.pill,
          backgroundColor: sys.elevated,
          opacity: 0.6,
        }}
      />
      <View
        style={{
          width: mapMarker.positionCore,
          height: mapMarker.positionCore,
          borderRadius: radii.pill,
          borderWidth: 2,
          borderColor: sys.elevated,
          backgroundColor: sys.label,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: mapMarker.shadow,
          transform: [{ rotate: `${heading ?? 0}deg` }],
        }}
      >
        {heading !== undefined ? (
          <Icon name="navigation-variant" size={14} color={sys.background} weight="semibold" />
        ) : null}
      </View>
    </View>
  );
}

import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';
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
  const tone = spot.interest && !spot.muted ? categoryColors[spot.interest] : undefined;
  return (
    <View
      accessible
      accessibilityLabel={[
        spot.name,
        spot.interest ? t(`interests.${spot.interest}`) : undefined,
        spot.queued ? t('home.queuePosition', { count: spot.queued }) : undefined,
      ]
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
          backgroundColor: spot.muted
            ? sys.fill
            : (tone?.background ?? (spot.hot ? sys.accentTint : sys.elevated)),
          borderWidth: spot.hot ? 2 : 1,
          borderColor: tone?.foreground ?? (spot.hot ? sys.accentText : sys.separator),
          boxShadow: mapMarker.shadow,
        }}
      >
        <Icon
          name={glyph}
          size={mapMarker.icon}
          color={
            spot.muted
              ? sys.labelTertiary
              : (tone?.foreground ?? (spot.hot ? sys.accentText : sys.labelSecondary))
          }
          weight="semibold"
        />
      </View>
      {spot.queued ? (
        <View
          style={{
            position: 'absolute',
            top: (mapMarker.hit - d) / 2 - 6,
            right: (mapMarker.hit - d) / 2 - 8,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: sys.accent,
            borderWidth: 1.5,
            borderColor: sys.background,
          }}
        >
          <Text variant="label" color={sys.onAccent} style={{ fontSize: 11, fontWeight: '700' }}>
            {spot.queued}
          </Text>
        </View>
      ) : null}
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

/** Blue location dot with a compass cone, kept aligned with north when the map rotates. */
export function UserPositionMarker({
  heading,
  mapBearing = 0,
  label,
}: {
  heading?: number | undefined;
  mapBearing?: number;
  label: string;
}) {
  const gradientId = `position-heading-${useId().replace(/:/g, '')}`;
  const hasHeading = heading !== undefined && Number.isFinite(heading) && heading >= 0;
  const rotation = hasHeading ? heading - (Number.isFinite(mapBearing) ? mapBearing : 0) : 0;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      pointerEvents="none"
      collapsable={false}
      style={{
        width: mapMarker.positionSize,
        height: mapMarker.positionSize,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {hasHeading ? (
        <Svg
          width={mapMarker.positionSize}
          height={mapMarker.positionSize}
          viewBox="0 0 72 72"
          style={{ position: 'absolute', transform: [{ rotate: `${rotation}deg` }] }}
        >
          <Defs>
            <RadialGradient id={gradientId} cx="36" cy="36" r="34" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={mapMarker.positionBlue} stopOpacity={0.45} />
              <Stop offset="0.55" stopColor={mapMarker.positionBlue} stopOpacity={0.25} />
              <Stop offset="1" stopColor={mapMarker.positionBlue} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d="M36 36 L16.5 8.15 A34 34 0 0 1 55.5 8.15 Z" fill={`url(#${gradientId})`} />
        </Svg>
      ) : null}
      <View
        style={{
          position: 'absolute',
          width: mapMarker.positionHalo,
          height: mapMarker.positionHalo,
          borderRadius: radii.pill,
          backgroundColor: mapMarker.positionHaloColor,
        }}
      />
      <View
        style={{
          width: mapMarker.positionCore,
          height: mapMarker.positionCore,
          borderRadius: radii.pill,
          borderWidth: 2,
          borderColor: mapMarker.positionRing,
          backgroundColor: mapMarker.positionBlue,
          boxShadow: mapMarker.shadow,
        }}
      />
    </View>
  );
}

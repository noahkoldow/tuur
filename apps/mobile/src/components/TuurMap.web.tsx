import { Pressable, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { colors } from '@tuur/ui';
import type { LatLng } from '@tuur/shared';
import { HeartPin, pinSize } from './HeartPin';
import { SpotMarker, spotDiameter } from './MapControls';
import { ROUTE_DONE_COLOR, type TuurMapProps } from './mapTypes';
import { useTranslation } from 'react-i18next';

/**
 * Web preview stand-in for the native MapLibre view (no WebGL native module on web): a light schematic canvas
 * that projects coordinates linearly, so layouts, markers and the route can be reviewed in a browser.
 */
export function TuurMap({
  center,
  stops = [],
  route,
  routeDone,
  leg,
  spots = [],
  onSpotPress,
  onMapPress,
  fit,
  user,
  bottomInset = 0,
  onStopPress,
  testID,
}: TuurMapProps) {
  const { t } = useTranslation();
  const navigating = Boolean(leg && leg.length > 1);
  const pts = [
    ...(fit ?? []),
    ...stops.map((s) => s.location),
    ...spots.map((s) => s.location),
    ...(route ?? []),
    ...(leg ?? []),
    ...(user ? [user] : []),
  ];
  const bounds = (() => {
    const base = pts.length ? pts : [center];
    const lats = base.map((p) => p.lat);
    const lngs = base.map((p) => p.lng);
    const pad = 0.0006;
    return {
      s: Math.min(...lats) - pad,
      n: Math.max(...lats) + pad,
      w: Math.min(...lngs) - pad,
      e: Math.max(...lngs) + pad,
    };
  })();
  const project = (p: { lat: number; lng: number }) => ({
    x: ((p.lng - bounds.w) / (bounds.e - bounds.w)) * 100,
    y: (1 - (p.lat - bounds.s) / (bounds.n - bounds.s)) * 100,
  });
  const points = (l: LatLng[]) => l.map((p) => `${project(p).x},${project(p).y}`).join(' ');
  const stroke = (l: LatLng[] | undefined, color: string, width: number, casing = true) =>
    l && l.length > 1 ? (
      <>
        {casing ? (
          <Polyline
            points={points(l)}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={width * 1.9}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <Polyline
          points={points(l)}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </>
    ) : null;
  return (
    <Pressable
      testID={testID}
      accessible={false}
      {...(onMapPress ? { onPress: onMapPress } : {})}
      style={{ flex: 1, backgroundColor: colors.surface.subtle, overflow: 'hidden' }}
    >
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 24, right: 24, top: 96, bottom: 24 + bottomInset }}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute' }}
        >
          {stroke(routeDone, ROUTE_DONE_COLOR, 1.4, false)}
          {stroke(route, navigating ? 'rgba(237,5,22,0.45)' : colors.brand.red, 1.4)}
          {stroke(leg, colors.brand.red, 2.4)}
        </Svg>
        {spots.map((s) => {
          const { x, y } = project(s.location);
          const d = Math.max(44, spotDiameter(s.scale) + 8);
          return (
            <Pressable
              key={`spot-${s.id}`}
              accessibilityRole="button"
              accessibilityLabel={s.name}
              onPress={() => onSpotPress?.(s.id)}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: [{ translateX: -d / 2 }, { translateY: -d / 2 }],
              }}
            >
              <SpotMarker spot={s} />
            </Pressable>
          );
        })}
        {stops.map((s) => {
          const { x, y } = project(s.location);
          const size = pinSize(s.state);
          return (
            <Pressable
              key={s.id}
              onPress={() => onStopPress?.(s.id)}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: [
                  { translateX: -Math.max(44, size * 1.2) / 2 },
                  { translateY: -Math.max(44, size * 1.3) },
                ],
              }}
            >
              <HeartPin
                number={s.number}
                state={s.state}
                size={size}
                {...(s.interest ? { interest: s.interest } : {})}
                partner={Boolean(s.partner)}
                partnerLabel={t('common.partner')}
              />
            </Pressable>
          );
        })}
        {user ? (
          <View
            style={{
              position: 'absolute',
              left: `${project(user).x}%`,
              top: `${project(user).y}%`,
              width: 18,
              height: 18,
              marginLeft: -9,
              marginTop: -9,
              borderRadius: 9,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink.primary }} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

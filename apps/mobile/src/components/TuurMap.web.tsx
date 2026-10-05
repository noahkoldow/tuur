import { useEffect, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { colors } from '@tuur/ui';
import type { LatLng } from '@tuur/shared';
import { HeartPin, pinSize } from './HeartPin';
import { LocateButton, SpotMarker, UserPositionMarker } from './MapControls';
import { LOCATE_ZOOM, ROUTE_DONE_COLOR, type TuurMapProps } from './mapTypes';
import { useTranslation } from 'react-i18next';
import { useReduceMotion } from '../motion';
import { MapRouteLegend } from './MapRouteLegend';
import { mapMarker } from '../theme';
import { navigationCenter } from './mapNavigation';

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
  followUser = false,
  showRouteLegend = false,
  spots = [],
  onSpotPress,
  onMapPress,
  fit,
  user,
  locateButton,
  locateButtonOffset = 16,
  recenterKey = 0,
  bottomInset = 0,
  onStopPress,
  testID,
}: TuurMapProps) {
  const { t } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [{ width: mapWidth, height: mapHeight }, setMapSize] = useState({
    width: windowWidth,
    height: windowHeight,
  });
  const canvasBottom = Math.min(24 + bottomInset, Math.max(24, mapHeight - 144));
  const reduceMotion = useReduceMotion();
  const navigating = Boolean(leg && leg.length > 1);
  const [locatedCenter, setLocatedCenter] = useState<LatLng | null>(null);
  const previousRecenterKey = useRef(recenterKey);
  const target = user ? (followUser ? navigationCenter(user, leg) : user) : center;

  useEffect(() => {
    setLocatedCenter(null);
  }, [fit]);

  useEffect(() => {
    if (previousRecenterKey.current === recenterKey) return;
    previousRecenterKey.current = recenterKey;
    setLocatedCenter({ lat: target.lat, lng: target.lng });
  }, [recenterKey, target.lat, target.lng]);

  const pts = [
    ...(fit ?? []),
    ...stops.map((s) => s.location),
    ...spots.map((s) => s.location),
    ...(route ?? []),
    ...(routeDone ?? []),
    ...(leg ?? []),
    ...(user ? [user] : []),
  ];
  const bounds = (() => {
    if (locatedCenter) {
      const focus = followUser ? target : locatedCenter;
      const degreesPerPixel = 360 / (512 * 2 ** LOCATE_ZOOM);
      const lngSpan = Math.max(1, mapWidth - 48) * degreesPerPixel;
      const latSpan =
        Math.max(1, mapHeight - 96 - canvasBottom) * degreesPerPixel * Math.cos((focus.lat * Math.PI) / 180);
      return {
        s: focus.lat - latSpan / 2,
        n: focus.lat + latSpan / 2,
        w: focus.lng - lngSpan / 2,
        e: focus.lng + lngSpan / 2,
      };
    }
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
  const stroke = (l: LatLng[] | undefined, color: string, width: number, dashed = false) =>
    l && l.length > 1 ? (
      <>
        <Polyline
          points={points(l)}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={width * 1.9}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <Polyline
          points={points(l)}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          {...(dashed ? { strokeDasharray: '6 8' } : {})}
        />
      </>
    ) : null;
  return (
    <View
      testID={testID}
      onLayout={(e) => setMapSize(e.nativeEvent.layout)}
      style={{ flex: 1, backgroundColor: colors.surface.subtle, overflow: 'hidden' }}
    >
      <Pressable
        accessible={false}
        {...(onMapPress ? { onPress: onMapPress } : {})}
        style={{ position: 'absolute', inset: 0 }}
      />
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 24, right: 24, top: 96, bottom: canvasBottom }}
      >
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute' }}
        >
          {stroke(
            route,
            navigating ? 'rgba(237,5,22,0.65)' : colors.brand.red,
            4,
            navigating || showRouteLegend,
          )}
          {stroke(routeDone, ROUTE_DONE_COLOR, 4)}
          {stroke(leg, colors.brand.red, 6.5)}
          {navigating && leg ? (
            <polyline
              points={points(leg)}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeOpacity={0.7}
              strokeDasharray="2 22"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            >
              {!reduceMotion ? (
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-24"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              ) : null}
            </polyline>
          ) : null}
        </Svg>
        {spots.map((s) => {
          const { x, y } = project(s.location);
          return (
            <Pressable
              key={`spot-${s.id}`}
              accessibilityRole="button"
              accessibilityLabel={[s.name, s.interest ? t(`interests.${s.interest}`) : undefined]
                .filter(Boolean)
                .join(', ')}
              onPress={() => onSpotPress?.(s.id)}
              style={({ pressed }) => ({
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
                opacity: pressed ? 0.7 : 1,
              })}
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
              accessibilityRole={onStopPress ? 'button' : undefined}
              accessibilityLabel={[
                s.number,
                t(s.state === 'current' ? 'map.next' : s.state === 'visited' ? 'map.walked' : 'map.ahead'),
                s.interest ? t(`interests.${s.interest}`) : undefined,
                s.partner ? t('common.partner') : undefined,
              ]
                .filter((part) => part !== undefined)
                .join(', ')}
              onPress={() => onStopPress?.(s.id)}
              style={({ pressed }) => ({
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
                zIndex: s.state === 'current' ? 10 : 1,
                opacity: pressed ? 0.7 : 1,
              })}
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
          <div
            role="img"
            aria-label={t('map.position')}
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              left: `${project(user).x}%`,
              top: `${project(user).y}%`,
              width: mapMarker.positionSize,
              height: mapMarker.positionSize,
              marginLeft: -mapMarker.positionSize / 2,
              marginTop: -mapMarker.positionSize / 2,
              zIndex: 20,
              display: 'flex',
              transitionProperty: 'left, top',
              transitionDuration: reduceMotion ? '0ms' : '300ms',
              transitionTimingFunction: 'cubic-bezier(0.77, 0, 0.175, 1)',
            }}
          >
            <UserPositionMarker heading={user.heading} label={t('map.position')} />
          </div>
        ) : null}
      </View>
      {showRouteLegend ? (
        <MapRouteLegend
          walked={Boolean(routeDone && routeDone.length > 1)}
          next={navigating}
          ahead={Boolean(route && route.length > 1)}
          bottom={bottomInset + 20}
        />
      ) : null}
      {user && locateButton !== false ? (
        <LocateButton bottom={bottomInset + locateButtonOffset} onPress={() => setLocatedCenter(target)} />
      ) : null}
    </View>
  );
}

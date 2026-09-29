import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { colors } from '@tuur/ui';
import { HeartPin } from './HeartPin';
import type { TuurMapProps } from './mapTypes';
import { useTranslation } from 'react-i18next';

/**
 * Web preview stand-in for the native MapLibre view (no WebGL native module on web): a light schematic canvas
 * that projects coordinates linearly, so layouts, markers and the route can be reviewed in a browser.
 */
export function TuurMap({
  center,
  stops = [],
  route,
  fit,
  user,
  bottomInset = 0,
  onStopPress,
  testID,
}: TuurMapProps) {
  const { t } = useTranslation();
  const pts = [...(fit ?? []), ...stops.map((s) => s.location), ...(route ?? []), ...(user ? [user] : [])];
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
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.surface.subtle, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 24, right: 24, top: 96, bottom: 24 + bottomInset }}>
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute' }}
        >
          {route && route.length > 1 ? (
            <>
              <Polyline
                points={route.map((p) => `${project(p).x},${project(p).y}`).join(' ')}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={2.6}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <Polyline
                points={route.map((p) => `${project(p).x},${project(p).y}`).join(' ')}
                fill="none"
                stroke={colors.brand.red}
                strokeWidth={1.4}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </Svg>
        {stops.map((s) => {
          const { x, y } = project(s.location);
          return (
            <View
              key={s.id}
              onTouchEnd={() => onStopPress?.(s.id)}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: [{ translateX: -22 }, { translateY: -40 }],
              }}
            >
              <HeartPin
                number={s.number}
                state={s.state}
                partner={Boolean(s.partner)}
                partnerLabel={t('common.partner')}
              />
            </View>
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
    </View>
  );
}

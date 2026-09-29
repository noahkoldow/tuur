import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { resolveMapStyle, colors } from '@tuur/ui';
import { config } from '../config';
import { HeartPin } from './HeartPin';
import type { TuurMapProps } from './mapTypes';
import { useTranslation } from 'react-i18next';

/** MapLibre map with the light tuur style: red route, heart-pin markers, own position with heading. */
export function TuurMap({
  center,
  zoom = 14,
  user,
  stops = [],
  route,
  fit,
  follow,
  bottomInset = 0,
  onStopPress,
  testID,
}: TuurMapProps) {
  const { t } = useTranslation();
  const cameraRef = useRef<CameraRef>(null);
  const style = useMemo(
    () =>
      resolveMapStyle({
        ...(config.mapStyleUrl ? { styleUrl: config.mapStyleUrl } : {}),
        ...(config.maptilerKey ? { maptilerKey: config.maptilerKey } : {}),
      }),
    [],
  );
  const routeGeoJson = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: (route ?? []).map((p) => [p.lng, p.lat]) },
    }),
    [route],
  );

  useEffect(() => {
    if (!fit?.length) return;
    const lats = fit.map((p) => p.lat);
    const lngs = fit.map((p) => p.lng);
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      { padding: { top: 90, left: 48, right: 48, bottom: 48 + bottomInset }, duration: 600 },
    );
  }, [fit, bottomInset]);

  const userLat = user?.lat;
  const userLng = user?.lng;
  useEffect(() => {
    if (follow && userLat !== undefined && userLng !== undefined)
      cameraRef.current?.easeTo({ center: [userLng, userLat], zoom: 16.5, duration: 800 });
  }, [follow, userLat, userLng]);

  return (
    <View style={{ flex: 1 }} testID={testID}>
      <Map style={{ flex: 1 }} mapStyle={style as never} logo attribution compass={false}>
        <Camera ref={cameraRef} initialViewState={{ center: [center.lng, center.lat], zoom }} />
        {route && route.length > 1 ? (
          <GeoJSONSource id="route" data={routeGeoJson}>
            <Layer
              id="route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#FFFFFF', 'line-width': 9 }}
            />
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': colors.brand.red, 'line-width': 5 }}
            />
          </GeoJSONSource>
        ) : null}
        {stops.map((s) => (
          <ViewAnnotation
            key={s.id}
            id={`stop-${s.id}`}
            lngLat={[s.location.lng, s.location.lat]}
            anchor="bottom"
            onPress={() => onStopPress?.(s.id)}
          >
            <HeartPin
              number={s.number}
              state={s.state}
              partner={Boolean(s.partner)}
              partnerLabel={t('common.partner')}
            />
          </ViewAnnotation>
        ))}
        {user ? (
          <ViewAnnotation id="me" lngLat={[user.lng, user.lat]} anchor="center">
            <View
              accessible
              accessibilityLabel={t('map.position')}
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 4,
                elevation: 4,
              }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: colors.ink.primary,
                  transform: [{ rotate: `${user.heading ?? 0}deg` }],
                }}
              />
            </View>
          </ViewAnnotation>
        ) : null}
      </Map>
    </View>
  );
}

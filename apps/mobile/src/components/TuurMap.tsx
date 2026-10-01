import { useEffect, useMemo, useRef, useState } from 'react';
import { View, useColorScheme } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { resolveMapStyle, colors } from '@tuur/ui';
import { cellDegForZoom, clusterByGrid, type LatLng } from '@tuur/shared';
import { config } from '../config';
import { HeartPin, pinSize } from './HeartPin';
import { ClusterMarker, LocateButton, SpotMarker } from './MapControls';
import { LOCATE_ZOOM, ROUTE_DONE_COLOR, type TuurMapProps } from './mapTypes';
import { useTranslation } from 'react-i18next';

const line = (pts: LatLng[] | undefined) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates: (pts ?? []).map((p) => [p.lng, p.lat]) },
});

/**
 * MapLibre map with the light tuur style: red route (current leg highlighted while navigating), heart-pin
 * markers with category glyphs, explored spots and the own position. The camera never follows by itself; the
 * locate button brings it back.
 */
export function TuurMap({
  center,
  zoom = 14,
  user,
  stops = [],
  route,
  routeDone,
  leg,
  spots = [],
  onSpotPress,
  onMapPress,
  fit,
  locateButton,
  bottomInset = 0,
  onStopPress,
  testID,
}: TuurMapProps) {
  const { t } = useTranslation();
  const cameraRef = useRef<CameraRef>(null);
  const appearance = useColorScheme() === 'dark' ? 'dark' : 'light';
  const style = useMemo(
    () =>
      resolveMapStyle(
        {
          ...(config.mapStyleUrl ? { styleUrl: config.mapStyleUrl } : {}),
          ...(config.maptilerKey ? { maptilerKey: config.maptilerKey } : {}),
        },
        appearance,
      ),
    [appearance],
  );
  const navigating = Boolean(leg && leg.length > 1);
  const [mapZoom, setMapZoom] = useState(zoom);
  const clusters = useMemo(() => clusterByGrid(spots, cellDegForZoom(mapZoom)), [spots, mapZoom]);
  const routeGeo = useMemo(() => line(route), [route]);
  const doneGeo = useMemo(() => line(routeDone), [routeDone]);
  const legGeo = useMemo(() => line(leg), [leg]);

  useEffect(() => {
    if (!fit?.length) return;
    const lats = fit.map((p) => p.lat);
    const lngs = fit.map((p) => p.lng);
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      { padding: { top: 90, left: 48, right: 48, bottom: 48 + bottomInset }, duration: 600 },
    );
  }, [fit, bottomInset]);

  // Center on the user once when the position first arrives; afterwards the map stays where the user pans it.
  const centered = useRef(false);
  const hasUser = Boolean(user);
  useEffect(() => {
    if (!hasUser || centered.current || fit?.length) return;
    centered.current = true;
    if (user) cameraRef.current?.easeTo({ center: [user.lng, user.lat], duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUser]);

  const locate = () => {
    if (user) cameraRef.current?.easeTo({ center: [user.lng, user.lat], zoom: LOCATE_ZOOM, duration: 600 });
  };

  return (
    <View style={{ flex: 1 }} testID={testID}>
      <Map
        style={{ flex: 1 }}
        mapStyle={style as never}
        logo
        attribution
        compass={false}
        {...(onMapPress ? { onPress: () => onMapPress() } : {})}
        onRegionDidChange={(e) => setMapZoom(e.nativeEvent.zoom)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [(user ?? center).lng, (user ?? center).lat], zoom }}
        />
        {routeDone && routeDone.length > 1 ? (
          <GeoJSONSource id="route-done" data={doneGeo}>
            <Layer
              id="route-done-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': ROUTE_DONE_COLOR, 'line-width': 4 }}
            />
          </GeoJSONSource>
        ) : null}
        {route && route.length > 1 ? (
          <GeoJSONSource id="route" data={routeGeo}>
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
              paint={{
                'line-color': colors.brand.red,
                'line-width': navigating ? 4 : 5,
                'line-opacity': navigating ? 0.45 : 1,
              }}
            />
          </GeoJSONSource>
        ) : null}
        {navigating ? (
          <GeoJSONSource id="leg" data={legGeo}>
            <Layer
              id="leg-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#FFFFFF', 'line-width': 12 }}
            />
            <Layer
              id="leg-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': colors.brand.red, 'line-width': 7 }}
            />
          </GeoJSONSource>
        ) : null}
        {clusters.map((c) =>
          c.members.length === 1 ? (
            <ViewAnnotation
              key={`spot-${c.key}`}
              id={`spot-${c.key}`}
              lngLat={[c.location.lng, c.location.lat]}
              anchor="center"
              onPress={() => onSpotPress?.(c.members[0]!.id)}
            >
              <SpotMarker spot={c.members[0]!} />
            </ViewAnnotation>
          ) : (
            <ViewAnnotation
              key={`cluster-${c.key}`}
              id={`cluster-${c.key}`}
              lngLat={[c.location.lng, c.location.lat]}
              anchor="center"
              onPress={() =>
                cameraRef.current?.easeTo({
                  center: [c.location.lng, c.location.lat],
                  zoom: mapZoom + 2,
                  duration: 450,
                })
              }
            >
              <ClusterMarker count={c.members.length} hot={c.members.some((m) => m.hot)} />
            </ViewAnnotation>
          ),
        )}
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
              size={pinSize(s.state)}
              {...(s.interest ? { interest: s.interest } : {})}
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
      {user && locateButton !== false ? <LocateButton onPress={locate} bottom={bottomInset + 16} /> : null}
    </View>
  );
}

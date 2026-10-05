import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, useColorScheme, useWindowDimensions } from 'react-native';
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
import { ClusterMarker, LocateButton, SpotMarker, UserPositionMarker } from './MapControls';
import { LOCATE_ZOOM, ROUTE_DONE_COLOR, type TuurMapProps } from './mapTypes';
import { useTranslation } from 'react-i18next';
import { useReduceMotion } from '../motion';
import { MapRouteLegend } from './MapRouteLegend';
import { navigationCenter } from './mapNavigation';

const line = (pts: LatLng[] | undefined) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates: (pts ?? []).map((p) => [p.lng, p.lat]) },
});

/**
 * MapLibre map with the light tuur style: red route (current leg highlighted while navigating), stop capsules
 * markers with category glyphs, explored spots and the own position. In navigation, native camera animations
 * follow the walker with a little room for the next turn. Panning suspends following until locate is pressed.
 */
export function TuurMap({
  center,
  zoom = 14,
  user,
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
  locateButton,
  locateButtonOffset = 16,
  recenterKey,
  bottomInset = 0,
  onStopPress,
  testID,
}: TuurMapProps) {
  const { t } = useTranslation();
  const cameraRef = useRef<CameraRef>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [mapHeight, setMapHeight] = useState(windowHeight);
  const cameraBottom = Math.min(Math.max(0, bottomInset), Math.max(0, mapHeight - 220));
  const reduceMotion = useReduceMotion();
  const following = useRef(true);
  const appearance = useColorScheme() === 'dark' ? 'dark' : 'light';
  const style = useMemo(
    () =>
      resolveMapStyle(
        {
          ...(config.offlineMapStyleUrl
            ? { styleUrl: config.offlineMapStyleUrl }
            : config.mapStyleUrl
              ? { styleUrl: config.mapStyleUrl }
              : {}),
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
  // Native annotations stack in insertion order: the active capsule should stay readable at crowded stops.
  const orderedStops = useMemo(
    () => [...stops].sort((a, b) => Number(a.state === 'current') - Number(b.state === 'current')),
    [stops],
  );
  const followCenter = user ? navigationCenter(user, leg) : undefined;
  const followLat = followCenter?.lat;
  const followLng = followCenter?.lng;

  useEffect(() => {
    if (
      !followUser ||
      !following.current ||
      followLat === undefined ||
      followLng === undefined ||
      fit?.length
    )
      return;
    cameraRef.current?.easeTo({
      center: [followLng, followLat],
      padding: { top: 96, left: 24, right: 24, bottom: cameraBottom + 48 },
      duration: reduceMotion ? 0 : 300,
    });
  }, [followUser, followLat, followLng, cameraBottom, reduceMotion, fit?.length]);

  useEffect(() => {
    if (!fit?.length) return;
    const lats = fit.map((p) => p.lat);
    const lngs = fit.map((p) => p.lng);
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      {
        padding: { top: 90, left: 48, right: 48, bottom: 48 + cameraBottom },
        duration: reduceMotion ? 0 : 300,
      },
    );
  }, [fit, cameraBottom, reduceMotion]);

  // Center on the user once when the position first arrives; afterwards the map stays where the user pans it.
  const centered = useRef(false);
  const hasUser = Boolean(user);
  useEffect(() => {
    if (!hasUser || centered.current || fit?.length || followUser) return;
    centered.current = true;
    if (user) cameraRef.current?.easeTo({ center: [user.lng, user.lat], duration: reduceMotion ? 0 : 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUser]);

  const locateTarget = (followUser ? followCenter : user) ?? center;
  const locateLat = locateTarget.lat;
  const locateLng = locateTarget.lng;
  const locate = useCallback(() => {
    following.current = true;
    cameraRef.current?.easeTo({
      center: [locateLng, locateLat],
      zoom: LOCATE_ZOOM,
      bearing: 0,
      pitch: 0,
      padding: { top: 96, left: 24, right: 24, bottom: cameraBottom + 48 },
      duration: reduceMotion ? 0 : 300,
    });
  }, [locateLng, locateLat, cameraBottom, reduceMotion]);

  const previousRecenterKey = useRef(recenterKey);
  useEffect(() => {
    if (previousRecenterKey.current === recenterKey) return;
    previousRecenterKey.current = recenterKey;
    locate();
  }, [recenterKey, locate]);

  return (
    <View style={{ flex: 1 }} testID={testID} onLayout={(e) => setMapHeight(e.nativeEvent.layout.height)}>
      <Map
        style={{ flex: 1 }}
        mapStyle={style as never}
        logo
        attribution
        compass={false}
        {...(onMapPress ? { onPress: () => onMapPress() } : {})}
        onRegionWillChange={(e) => {
          if (e.nativeEvent.userInteraction) following.current = false;
        }}
        onRegionDidChange={(e) => setMapZoom(e.nativeEvent.zoom)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [(user ?? center).lng, (user ?? center).lat],
            zoom: followUser ? Math.max(zoom, 16) : zoom,
            padding: { top: 96, left: 24, right: 24, bottom: cameraBottom + 48 },
          }}
        />
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
                'line-opacity': navigating ? 0.65 : 1,
                ...(navigating || showRouteLegend ? { 'line-dasharray': [1.5, 2] } : {}),
                'line-opacity-transition': { duration: reduceMotion ? 0 : 200, delay: 0 },
              }}
            />
          </GeoJSONSource>
        ) : null}
        {routeDone && routeDone.length > 1 ? (
          <GeoJSONSource id="route-done" data={doneGeo}>
            <Layer
              id="route-done-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#FFFFFF', 'line-width': 8 }}
            />
            <Layer
              id="route-done-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': ROUTE_DONE_COLOR, 'line-width': 4 }}
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
                  duration: reduceMotion ? 0 : 300,
                })
              }
            >
              <ClusterMarker count={c.members.length} hot={c.members.some((m) => m.hot)} />
            </ViewAnnotation>
          ),
        )}
        {orderedStops.map((s) => (
          <ViewAnnotation
            key={s.id}
            id={`stop-${s.id}`}
            lngLat={[s.location.lng, s.location.lat]}
            anchor="center"
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
            <UserPositionMarker heading={user.heading} label={t('map.position')} />
          </ViewAnnotation>
        ) : null}
      </Map>
      {showRouteLegend ? (
        <MapRouteLegend
          walked={Boolean(routeDone && routeDone.length > 1)}
          next={navigating}
          ahead={Boolean(route && route.length > 1)}
          bottom={bottomInset + 20}
        />
      ) : null}
      {user && locateButton !== false ? (
        <LocateButton onPress={locate} bottom={bottomInset + locateButtonOffset} />
      ) : null}
    </View>
  );
}

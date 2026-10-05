import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import MapView, { Marker, Polyline, type MapStyleElement } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { colors } from '@tuur/ui';
import { HeartPin, pinSize } from './HeartPin';
import { cellDegForZoom, clusterByGrid } from '@tuur/shared';
import { ClusterMarker, LocateButton, SpotMarker, UserPositionMarker } from './MapControls';
import { LOCATE_ZOOM, ROUTE_DONE_COLOR, type TuurMapProps } from './mapTypes';
import { useReduceMotion } from '../motion';
import { MapRouteLegend } from './MapRouteLegend';
import { navigationCenter } from './mapNavigation';
import { useHeading } from '../location/useHeading';
import { useNavigationBearing } from './useNavigationBearing';

/** Light, muted Google style for Android so the red route dominates (spec 2.2); iOS uses Apple's muted map type. */
const LIGHT_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#f6f6f6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7a7a7a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dfe6ea' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#eef1ec' }] },
];

const toCoord = (p: { lat: number; lng: number }) => ({ latitude: p.lat, longitude: p.lng });
// Apple Maps ignores zoom; a fixed camera altitude restores a walking-scale view there too.
const LOCATE_ALTITUDE = 1200;

/**
 * Expo Go preview of the map (MapLibre is not part of Expo Go): the same props rendered with react-native-maps,
 * which Expo Go ships. Only bundled when EXPO_PUBLIC_EXPO_GO=1 (see metro.config.js).
 */
export function TuurMap({
  center,
  zoom = 14,
  scrollEnabled = true,
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
  const ref = useRef<MapView>(null);
  const fitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [mapHeight, setMapHeight] = useState(windowHeight);
  const cameraBottom = Math.min(Math.max(0, bottomInset), Math.max(0, mapHeight - 220));
  const following = useRef(true);
  const reduceMotion = useReduceMotion();
  const delta = 360 / 2 ** (followUser ? Math.max(zoom, 16) : zoom);
  const navigating = Boolean(leg && leg.length > 1);
  const [mapZoom, setMapZoom] = useState(zoom);
  const [mapBearing, setMapBearing] = useState(0);
  const compassHeading = useHeading(Boolean(user));
  const followBearing = useNavigationBearing(followUser, user?.heading, user?.speed);
  const cameraRead = useRef({ running: false, requested: false });
  const clusters = useMemo(() => clusterByGrid(spots, cellDegForZoom(mapZoom)), [spots, mapZoom]);
  const followCenter = user ? navigationCenter(user, leg) : undefined;
  const followLat = followCenter?.lat;
  const followLng = followCenter?.lng;

  // Region events omit rotation; read the camera on both Apple and Google Maps.
  // Coalesce changes while a native read is pending, retaining the final bearing.
  const updateMapBearing = useCallback(() => {
    const map = ref.current;
    if (!map) return;
    const read = cameraRead.current;
    read.requested = true;
    if (read.running) return;
    read.running = true;
    const refresh = async () => {
      try {
        do {
          read.requested = false;
          const camera = await map.getCamera();
          if (ref.current !== map) return;
          if (Number.isFinite(camera.heading)) setMapBearing(camera.heading);
        } while (read.requested);
      } catch {
        // The camera can be unavailable while the native map is mounting.
      } finally {
        read.running = false;
      }
    };
    void refresh();
  }, []);

  const follow = useCallback(() => {
    if (
      !followUser ||
      !following.current ||
      followLat === undefined ||
      followLng === undefined ||
      fit?.length
    )
      return;
    const camera = {
      center: { latitude: followLat, longitude: followLng },
      ...(followBearing !== undefined ? { heading: followBearing } : {}),
    };
    if (reduceMotion) ref.current?.setCamera(camera);
    else ref.current?.animateCamera(camera, { duration: 300 });
  }, [followUser, followLat, followLng, followBearing, reduceMotion, fit?.length]);

  useEffect(follow, [follow]);

  useEffect(() => {
    if (!fit?.length) return;
    fitTimeout.current = setTimeout(() => {
      fitTimeout.current = null;
      ref.current?.fitToCoordinates(fit.map(toCoord), {
        edgePadding: { top: 120, left: 48, right: 48, bottom: 48 + cameraBottom },
        animated: !reduceMotion,
      });
    }, 250);
    return () => {
      if (fitTimeout.current !== null) clearTimeout(fitTimeout.current);
      fitTimeout.current = null;
    };
  }, [fit, cameraBottom, reduceMotion]);

  // Center on the user once when the position first arrives; afterwards the map stays where the user pans it.
  const centered = useRef(false);
  const hasUser = Boolean(user);
  useEffect(() => {
    if (!hasUser || centered.current || fit?.length || followUser) return;
    centered.current = true;
    if (user) {
      if (reduceMotion) ref.current?.setCamera({ center: toCoord(user) });
      else ref.current?.animateCamera({ center: toCoord(user) }, { duration: 300 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUser]);

  const locateTarget = (followUser ? followCenter : user) ?? center;
  const locateLat = locateTarget.lat;
  const locateLng = locateTarget.lng;
  const locate = useCallback(() => {
    following.current = true;
    // A pending initial/inset fit must not undo the user's explicit reset.
    if (fitTimeout.current !== null) clearTimeout(fitTimeout.current);
    fitTimeout.current = null;
    const camera = {
      center: { latitude: locateLat, longitude: locateLng },
      zoom: LOCATE_ZOOM,
      altitude: LOCATE_ALTITUDE,
      heading: followUser ? (followBearing ?? mapBearing) : 0,
      pitch: 0,
    };
    if (reduceMotion) ref.current?.setCamera(camera);
    else ref.current?.animateCamera(camera, { duration: 300 });
  }, [locateLat, locateLng, followUser, followBearing, mapBearing, reduceMotion]);

  const previousRecenterKey = useRef(recenterKey);
  useEffect(() => {
    if (previousRecenterKey.current === recenterKey) return;
    previousRecenterKey.current = recenterKey;
    locate();
  }, [recenterKey, locate]);

  return (
    <View style={{ flex: 1 }} testID={testID} onLayout={(e) => setMapHeight(e.nativeEvent.layout.height)}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        initialRegion={{ ...toCoord(user ?? center), latitudeDelta: delta, longitudeDelta: delta }}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={LIGHT_STYLE}
        userInterfaceStyle="light"
        showsPointsOfInterests={false}
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        scrollEnabled={scrollEnabled}
        mapPadding={{ top: 0, left: 0, right: 0, bottom: cameraBottom }}
        onMapReady={() => {
          follow();
          updateMapBearing();
        }}
        onRegionChange={updateMapBearing}
        onRegionChangeComplete={(r) => {
          setMapZoom(Math.log2(360 / Math.max(r.longitudeDelta, 1e-6)));
          updateMapBearing();
        }}
        onPanDrag={() => {
          following.current = false;
        }}
        onTouchStart={() => {
          following.current = false;
        }}
        onRegionChangeStart={(_, details) => {
          if (details.isGesture) following.current = false;
        }}
        {...(onMapPress ? { onPress: (e) => e.nativeEvent.action !== 'marker-press' && onMapPress() } : {})}
      >
        {route && route.length > 1 ? (
          <>
            <Polyline
              coordinates={route.map(toCoord)}
              strokeColor="#FFFFFF"
              strokeWidth={8}
              lineCap="round"
            />
            <Polyline
              coordinates={route.map(toCoord)}
              strokeColor={navigating ? 'rgba(237,5,22,0.65)' : colors.brand.red}
              strokeWidth={navigating ? 4 : 4.5}
              {...(navigating || showRouteLegend ? { lineDashPattern: [6, 8] } : {})}
              lineCap="round"
              lineJoin="round"
            />
          </>
        ) : null}
        {routeDone && routeDone.length > 1 ? (
          <>
            <Polyline
              coordinates={routeDone.map(toCoord)}
              strokeColor="#FFFFFF"
              strokeWidth={8}
              lineCap="round"
            />
            <Polyline
              coordinates={routeDone.map(toCoord)}
              strokeColor={ROUTE_DONE_COLOR}
              strokeWidth={4}
              lineCap="round"
            />
          </>
        ) : null}
        {navigating && leg ? (
          <>
            <Polyline coordinates={leg.map(toCoord)} strokeColor="#FFFFFF" strokeWidth={11} lineCap="round" />
            <Polyline
              coordinates={leg.map(toCoord)}
              strokeColor={colors.brand.red}
              strokeWidth={6.5}
              lineCap="round"
              lineJoin="round"
            />
          </>
        ) : null}
        {clusters.map((c) =>
          c.members.length === 1 ? (
            <Marker
              key={`spot-${c.key}`}
              coordinate={toCoord(c.location)}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => onSpotPress?.(c.members[0]!.id)}
              accessibilityLabel={[
                c.members[0]!.name,
                c.members[0]!.interest ? t(`interests.${c.members[0]!.interest}`) : undefined,
              ]
                .filter(Boolean)
                .join(', ')}
              zIndex={c.members[0]!.hot ? 5 : 2}
            >
              <SpotMarker spot={c.members[0]!} />
            </Marker>
          ) : (
            <Marker
              key={`cluster-${c.key}`}
              coordinate={toCoord(c.location)}
              anchor={{ x: 0.5, y: 0.5 }}
              accessibilityLabel={`${c.members.length}`}
              zIndex={6}
              onPress={() =>
                ref.current?.animateCamera(
                  { center: toCoord(c.location), zoom: mapZoom + 2 },
                  { duration: reduceMotion ? 0 : 300 },
                )
              }
            >
              <ClusterMarker count={c.members.length} hot={c.members.some((m) => m.hot)} />
            </Marker>
          ),
        )}
        {stops.map((s) => (
          <Marker
            key={s.id}
            coordinate={toCoord(s.location)}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onStopPress?.(s.id)}
            accessibilityLabel={[
              s.number,
              t(s.state === 'current' ? 'map.next' : s.state === 'visited' ? 'map.walked' : 'map.ahead'),
              s.interest ? t(`interests.${s.interest}`) : undefined,
              s.partner ? t('common.partner') : undefined,
            ]
              .filter((part) => part !== undefined)
              .join(', ')}
            zIndex={s.state === 'current' ? 10 : 1}
          >
            <HeartPin
              number={s.number}
              state={s.state}
              size={pinSize(s.state)}
              {...(s.interest ? { interest: s.interest } : {})}
              partner={Boolean(s.partner)}
              partnerLabel={t('common.partner')}
            />
          </Marker>
        ))}
        {user ? (
          <Marker coordinate={toCoord(user)} anchor={{ x: 0.5, y: 0.5 }} zIndex={20}>
            <UserPositionMarker
              heading={compassHeading ?? user.heading}
              mapBearing={mapBearing}
              label={t('map.position')}
            />
          </Marker>
        ) : null}
      </MapView>
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

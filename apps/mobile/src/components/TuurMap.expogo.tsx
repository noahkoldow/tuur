import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, Polyline, type MapStyleElement } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { colors } from '@tuur/ui';
import { HeartPin, pinSize } from './HeartPin';
import { cellDegForZoom, clusterByGrid } from '@tuur/shared';
import { ClusterMarker, LocateButton, SpotMarker } from './MapControls';
import { LOCATE_ZOOM, ROUTE_DONE_COLOR, type TuurMapProps } from './mapTypes';

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

/**
 * Expo Go preview of the map (MapLibre is not part of Expo Go): the same props rendered with react-native-maps,
 * which Expo Go ships. Only bundled when EXPO_PUBLIC_EXPO_GO=1 (see metro.config.js).
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
  const ref = useRef<MapView>(null);
  const delta = 360 / 2 ** zoom;
  const navigating = Boolean(leg && leg.length > 1);
  const [mapZoom, setMapZoom] = useState(zoom);
  const clusters = useMemo(() => clusterByGrid(spots, cellDegForZoom(mapZoom)), [spots, mapZoom]);

  useEffect(() => {
    if (!fit?.length) return;
    const id = setTimeout(
      () =>
        ref.current?.fitToCoordinates(fit.map(toCoord), {
          edgePadding: { top: 120, left: 48, right: 48, bottom: 48 + bottomInset },
          animated: true,
        }),
      250,
    );
    return () => clearTimeout(id);
  }, [fit, bottomInset]);

  // Center on the user once when the position first arrives; afterwards the map stays where the user pans it.
  const centered = useRef(false);
  const hasUser = Boolean(user);
  useEffect(() => {
    if (!hasUser || centered.current || fit?.length) return;
    centered.current = true;
    if (user) ref.current?.animateCamera({ center: toCoord(user) }, { duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUser]);

  const locate = () => {
    if (user) ref.current?.animateCamera({ center: toCoord(user), zoom: LOCATE_ZOOM }, { duration: 600 });
  };

  return (
    <View style={{ flex: 1 }} testID={testID}>
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
        mapPadding={{ top: 0, left: 0, right: 0, bottom: bottomInset }}
        onRegionChangeComplete={(r) => setMapZoom(Math.log2(360 / Math.max(r.longitudeDelta, 1e-6)))}
        {...(onMapPress ? { onPress: (e) => e.nativeEvent.action !== 'marker-press' && onMapPress() } : {})}
      >
        {routeDone && routeDone.length > 1 ? (
          <Polyline coordinates={routeDone.map(toCoord)} strokeColor={ROUTE_DONE_COLOR} strokeWidth={4} />
        ) : null}
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
              strokeColor={navigating ? 'rgba(237,5,22,0.45)' : colors.brand.red}
              strokeWidth={navigating ? 4 : 4.5}
              lineCap="round"
              lineJoin="round"
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
              accessibilityLabel={c.members[0]!.name}
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
                  { duration: 450 },
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
            anchor={{ x: 0.5, y: 1 }}
            onPress={() => onStopPress?.(s.id)}
            accessibilityLabel={`${s.number}`}
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
            <UserDot heading={user.heading} label={t('map.position')} />
          </Marker>
        ) : null}
      </MapView>
      {user && locateButton !== false ? <LocateButton onPress={locate} bottom={bottomInset + 16} /> : null}
    </View>
  );
}

function UserDot({ heading, label }: { heading?: number | undefined; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
        transform: [{ rotate: `${heading ?? 0}deg` }],
      }}
    >
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.ink.primary }} />
    </View>
  );
}

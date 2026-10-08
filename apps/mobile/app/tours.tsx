import { useEffect, useMemo, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { tilesAround, type ExploredSpot } from '@tuur/shared';
import { useBackend } from '../src/backend';
import { Banner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { CurationProgress } from '../src/components/curation-progress';
import { Mascot } from '../src/components/Mascot';
import { ScrollScreen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { TourCard } from '../src/components/TourCard';
import { useArea } from '../src/location/useArea';
import { areaErrorKeys } from '../src/location/areaErrors';
import { usePosition } from '../src/location/usePosition';
import { useSettings } from '../src/state/settings';

/** Ready-made tours, ranked by aggregate activity at their stops when it is available. */
export default function Tours() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const lang = useSettings((s) => s.language);
  const { position, request } = usePosition();
  const area = useArea(position);
  const availableTours = area.tours;
  const [spots, setSpots] = useState<ExploredSpot[]>([]);
  const tile = area.tile;
  useEffect(() => {
    setSpots([]);
    if (!tile || !area.tours.length) return;
    let cancelled = false;
    void backend
      .getExploredSpots(tilesAround(tile, 1))
      .then((next) => {
        if (!cancelled) setSpots(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend, tile, area.tours.length]);
  const tours = useMemo(() => {
    const counts = new Map(spots.map((spot) => [spot.poiId, spot.explorers]));
    const popularity = (tour: (typeof availableTours)[number]) =>
      tour.stops.reduce((sum, stop) => sum + (counts.get(stop.poiId) ?? 0), 0);
    return [...availableTours].sort(
      (a, b) => popularity(b) - popularity(a) || Number(b.free) - Number(a.free),
    );
  }, [availableTours, spots]);
  const loading = ['exploring', 'generating'].includes(area.phase);
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('home.spotsTitle') }} />
      <ScrollScreen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Mascot pose="map" size={80} />
          <Text variant="subheadline" style={{ flex: 1 }}>
            {t('home.premadeBody')}
          </Text>
        </View>
        {!position ? (
          <Button icon="map-pin" label={t('home.enableLocation')} onPress={() => void request()} />
        ) : null}
        {loading && !tours.length ? (
          <CurationProgress
            title={t('curation.premadeTitle')}
            detail={t(area.phase === 'exploring' ? 'curation.findingDetail' : 'curation.connectingDetail')}
            stages={[
              {
                id: 'places',
                label: t('curation.finding'),
                state: area.phase === 'exploring' ? 'active' : 'complete',
              },
              {
                id: 'route',
                label: t('curation.connecting'),
                state: area.phase === 'generating' ? 'active' : 'pending',
              },
              { id: 'ready', label: t('curation.choose'), state: 'pending' },
            ]}
          />
        ) : null}
        {area.phase === 'failed' ? (
          <View style={{ gap: 12 }}>
            <Banner tone="error" text={t(areaErrorKeys[area.errorCode ?? 'generic'])} />
            <Button variant="tinted" label={t('common.retry')} onPress={area.reload} />
          </View>
        ) : null}
        {position && !loading && area.phase !== 'failed' && !tours.length ? (
          <View style={{ gap: 12 }}>
            <Text>{t('home.noTours')}</Text>
            <Button variant="tinted" label={t('home.plannedCta')} onPress={() => router.push('/plan')} />
          </View>
        ) : null}
        {tours.map((tour) => (
          <TourCard
            key={tour.id}
            tour={tour}
            lang={lang}
            onPress={() => router.push({ pathname: '/tour/[id]', params: { id: tour.id } })}
          />
        ))}
      </ScrollScreen>
    </>
  );
}

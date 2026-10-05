import { BottomSheet } from '@expo/ui';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LatLng, Poi } from '@tuur/shared';
import { nearbyPausePlaces, openPauseDirections, type PauseFilter } from '../guide/pauseDestination';
import type { GuideRuntime } from '../guide/runtime';
import { usePoiPool } from '../hooks/usePoiPool';
import { metrics, sys } from '../theme';
import { Banner } from './Banner';
import { Button, IconButton } from './Button';
import { Chip } from './Chip';
import { Text } from './Text';

const FILTERS: PauseFilter[] = ['all', 'coffee', 'food', 'rest'];

/** An explicit pause destination never becomes a narrated stop or rewrites the tour. */
export function PauseFinder({
  open,
  onClose,
  position,
  runtime,
}: {
  open: boolean;
  onClose: () => void;
  position?: LatLng;
  runtime?: GuideRuntime;
}) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const [filter, setFilter] = useState<PauseFilter>('all');
  const [opening, setOpening] = useState<string>();
  const [failed, setFailed] = useState(false);
  const { pois, loading, error, reload } = usePoiPool(open ? (position ?? null) : null, 2);
  const places = useMemo(
    () => (position ? nearbyPausePlaces(position, pois, filter) : []),
    [position, pois, filter],
  );
  const navigate = async (poi: Poi) => {
    if (opening) return;
    setOpening(poi.id);
    setFailed(false);
    try {
      await openPauseDirections(poi, (url) => Linking.openURL(url), runtime);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setOpening(undefined);
    }
  };

  return (
    <BottomSheet isPresented={open} onDismiss={onClose} containerColor={sys.grouped} contentPadding={20}>
      <View style={{ gap: 16, maxHeight: height * 0.72 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
            {t('pauseFinder.title')}
          </Text>
          <IconButton icon="x" label={t('pauseFinder.close')} onPress={onClose} />
        </View>
        <Text variant="subheadline">{t(runtime ? 'pauseFinder.activeHint' : 'pauseFinder.hint')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {FILTERS.map((value) => (
            <Chip
              key={value}
              label={t(`pauseFinder.${value}`)}
              selected={filter === value}
              onPress={() => setFilter(value)}
            />
          ))}
        </ScrollView>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
          {!position ? <Banner text={t('pauseFinder.location')} /> : null}
          {loading ? <Text accessibilityLiveRegion="polite">{t('pauseFinder.loading')}</Text> : null}
          {error ? (
            <View style={{ gap: 8 }}>
              <Banner tone="error" text={t('pauseFinder.loadError')} />
              <Button variant="secondary" label={t('pauseFinder.retry')} onPress={reload} />
            </View>
          ) : null}
          {failed ? <Banner tone="error" text={t('pauseFinder.openError')} /> : null}
          {position && !loading && !error && places.length === 0 ? (
            <Banner text={t('pauseFinder.empty')} />
          ) : null}
          {places.map(({ poi, kind, distanceM }) => (
            <View
              key={poi.id}
              style={{
                padding: 16,
                gap: 8,
                borderRadius: metrics.radius.card,
                backgroundColor: sys.elevated,
              }}
            >
              <Text variant="headline">{poi.name}</Text>
              <Text variant="footnote">
                {t(`pauseFinder.${kind}`)} ·{' '}
                {t('pauseFinder.distance', { meters: Math.max(10, Math.round(distanceM / 10) * 10) })}
              </Text>
              <Button
                size="regular"
                variant="tinted"
                icon="external-link"
                label={t('pauseFinder.navigate')}
                loading={opening === poi.id}
                disabled={!!opening}
                onPress={() => void navigate(poi)}
              />
            </View>
          ))}
          <Text variant="footnote" color={sys.labelSecondary}>
            {t('pauseFinder.sourceHint')}
          </Text>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

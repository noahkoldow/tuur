import { useEffect, useState } from 'react';
import { Linking, useColorScheme } from 'react-native';
import { BottomSheet, Button, Column, ScrollView, Text } from '@expo/ui';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { encodeGeohash, type Poi } from '@tuur/shared';
import { palette } from '@tuur/ui';
import { useBackend } from '../backend';
import { config } from '../config';
import type { TourRecordStop } from '../state/history';
import { attributionUrl } from './image-attribution';
import { placeInformation } from './placeDetails';

interface Props {
  stop: TourRecordStop | undefined;
  /** Reuse already-loaded map data before looking up an older stop without a saved narration. */
  poi?: Poi | undefined;
  onDismiss: () => void;
}

/** Reading a stop never changes the tour's destination, playback or progress. */
export function StopInfoSheet({ stop, poi, onDismiss }: Props) {
  const colors = palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <BottomSheet
      isPresented={Boolean(stop)}
      onDismiss={onDismiss}
      snapPoints={['half', 'full']}
      containerColor={colors.background}
      testID="stop-info-sheet"
    >
      {stop ? <StopInformation key={stop.id} stop={stop} poi={poi} onDismiss={onDismiss} /> : null}
    </BottomSheet>
  );
}

function StopInformation({ stop, poi, onDismiss }: Props & { stop: TourRecordStop }) {
  const { t, i18n } = useTranslation();
  const backend = useBackend();
  const insets = useSafeAreaInsets();
  const colors = palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const narration = stop.narration?.text.trim() ? stop.narration : undefined;
  const suppliedPoi = poi?.id === stop.id ? poi : undefined;
  const [loadedPoi, setLoadedPoi] = useState<Poi>();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [linkError, setLinkError] = useState(false);
  const needsLookup = !narration && !suppliedPoi;
  const {
    id,
    location: { lat, lng },
  } = stop;

  useEffect(() => {
    if (!needsLookup) return;
    let cancelled = false;
    const tile = encodeGeohash(lat, lng, config.tilePrecision);
    void backend
      .getPois([tile])
      .then((pois) => {
        if (cancelled) return;
        setLoadedPoi(pois.find((candidate) => candidate.id === id));
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [backend, id, lat, lng, needsLookup, attempt]);

  const place = suppliedPoi ?? loadedPoi;
  const information = !narration && place ? placeInformation(place, lang) : undefined;
  const text = narration?.text ?? information?.text;
  const sources = narration
    ? (narration.grounding?.sources ?? []).flatMap((source) => {
        const url = attributionUrl(source.uri);
        return url ? [{ url, label: source.title ?? t('stopInfo.source') }] : [];
      })
    : information?.sourceUrl
      ? [{ url: information.sourceUrl, label: t('cards.source', { source: 'Wikipedia' }) }]
      : [];
  const openUrl = (url: string) => {
    setLinkError(false);
    void Linking.openURL(url).catch(() => setLinkError(true));
  };
  const control = (label: string, onPress: () => void, key?: string) => (
    <Button
      key={key}
      variant="text"
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: colors.backgroundGrouped,
      }}
    >
      <Text textStyle={{ color: colors.accentText, fontSize: 16, lineHeight: 20, fontWeight: '600' }}>
        {label}
      </Text>
    </Button>
  );

  return (
    <ScrollView>
      <Column spacing={16} style={{ paddingBottom: insets.bottom + 24 }}>
        {control(t('common.close'), onDismiss)}
        <Column spacing={6}>
          <Text textStyle={{ color: colors.labelSecondary, fontSize: 15 }}>{t('stopInfo.title')}</Text>
          <Text textStyle={{ color: colors.label, fontSize: 24, fontWeight: '700' }}>{stop.name}</Text>
          {narration?.title && narration.title !== stop.name ? (
            <Text textStyle={{ color: colors.label, fontSize: 18, fontWeight: '600' }}>
              {narration.title}
            </Text>
          ) : null}
        </Column>
        {narration ? (
          <Text textStyle={{ color: colors.labelSecondary, fontSize: 14 }}>{t('player.aiGenerated')}</Text>
        ) : null}
        {narration?.sponsored ? (
          <Text textStyle={{ color: colors.labelSecondary, fontSize: 14 }}>{t('partner.adLabel')}</Text>
        ) : null}
        {text ? (
          text
            .split(/\n\s*\n/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <Text key={index} textStyle={{ color: colors.label, fontSize: 17, lineHeight: 26 }}>
                {paragraph}
              </Text>
            ))
        ) : needsLookup && loadState === 'loading' ? (
          <Text textStyle={{ color: colors.labelSecondary, fontSize: 17 }}>{t('stopInfo.loading')}</Text>
        ) : needsLookup && loadState === 'error' ? (
          <Column spacing={12}>
            <Text textStyle={{ color: colors.label, fontSize: 17 }}>{t('stopInfo.loadError')}</Text>
            {control(t('common.retry'), () => {
              setLoadState('loading');
              setAttempt((value) => value + 1);
            })}
          </Column>
        ) : (
          <Text textStyle={{ color: colors.labelSecondary, fontSize: 17 }}>{t('stopInfo.unavailable')}</Text>
        )}
        {sources.map((source, index) =>
          control(source.label, () => openUrl(source.url), `${source.url}:${index}`),
        )}
        {information
          ? control('CC BY-SA 4.0', () => openUrl('https://creativecommons.org/licenses/by-sa/4.0/'))
          : null}
        {linkError ? (
          <Text textStyle={{ color: colors.label, fontSize: 15 }}>{t('cards.openLinkError')}</Text>
        ) : null}
      </Column>
    </ScrollView>
  );
}

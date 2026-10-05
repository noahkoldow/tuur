import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@tuur/shared';
import { Button, IconButton } from '../../../src/components/Button';
import { ListGroup } from '../../../src/components/ListGroup';
import { RunningTour } from '../../../src/components/RunningTour';
import { ScrollScreen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { TuuSays } from '../../../src/components/TuuSays';
import { getDownloadManager, getFileStore, getOfflineLibrary } from '../../../src/offline';
import { downloadedTourGpx } from '../../../src/offline/gpxExport';
import { shareGpx } from '../../../src/offline/shareGpx';
import { metrics } from '../../../src/theme';

/** Offline library (spec 4.8): downloaded tours with sizes, free storage and delete. */
export default function Downloads() {
  const { t } = useTranslation();
  const router = useRouter();
  const library = getOfflineLibrary();
  const items = useSyncExternalStore(
    library.subscribe,
    () => library.list(),
    () => [],
  );
  const [free, setFree] = useState<number | undefined>();
  const exporting = useRef(false);
  const [exportingId, setExportingId] = useState<string>();
  const [exportError, setExportError] = useState<string>();
  const total = items.reduce((s, i) => s + i.bytes, 0);

  useEffect(() => {
    void getFileStore().freeBytes().then(setFree);
  }, [items.length]);

  const exportGpx = async (id: string) => {
    if (exporting.current) return;
    exporting.current = true;
    setExportingId(id);
    setExportError(undefined);
    try {
      await shareGpx(() => downloadedTourGpx(library, id), t('downloads.exportGpx'));
    } catch {
      setExportError(id);
    } finally {
      exporting.current = false;
      setExportingId(undefined);
    }
  };

  const confirmDelete = (id: string) =>
    Alert.alert(t('downloads.delete'), t('downloads.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('downloads.delete'),
        style: 'destructive',
        onPress: () => void getDownloadManager().remove(id),
      },
    ]);

  const footer = [
    t('downloads.storage', { size: formatBytes(total) }),
    free !== undefined ? t('downloads.free', { size: formatBytes(free) }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  if (items.length === 0)
    return (
      <ScrollScreen contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <RunningTour />
        <Text variant="title3" align="center">
          {t('downloads.empty')}
        </Text>
        <TuuSays pose="relax" size={96} text={t('downloads.emptyHint')} style={{ alignSelf: 'stretch' }} />
      </ScrollScreen>
    );

  return (
    <ScrollScreen>
      <RunningTour />
      <TuuSays pose="present" size={56} tipId="downloads.intro" text={t('tuu.downloadsTip')} />
      <ListGroup footer={footer}>
        {items.map((i) => (
          <View key={i.tourId} style={{ padding: metrics.margin, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline">{i.title}</Text>
                <Text variant="footnote">
                  {`${formatBytes(i.bytes)} · ${i.complete ? t(i.hasMap ? 'downloads.downloaded' : 'downloads.storiesDownloaded') : t('downloads.partial')}`}
                </Text>
              </View>
              <IconButton
                icon="trash-2"
                label={t('downloads.delete')}
                onPress={() => confirmDelete(i.tourId)}
                disabled={exportingId === i.tourId}
              />
            </View>
            <Button
              variant="tinted"
              size="regular"
              icon={i.complete ? 'play' : 'download'}
              label={t(i.complete ? 'downloads.openInApp' : 'downloads.resume')}
              accessibilityHint={i.complete ? t('downloads.openInAppHint') : undefined}
              onPress={() =>
                router.push({ pathname: '/tour/[id]', params: { id: i.tourId, lang: i.lang, download: '1' } })
              }
            />
            {i.complete && (
              <>
                <Text variant="footnote">{t('downloads.openInAppHint')}</Text>
                <Button
                  variant="secondary"
                  size="regular"
                  icon="share-2"
                  label={t('downloads.exportGpx')}
                  accessibilityHint={t('downloads.exportGpxHint')}
                  loading={exportingId === i.tourId}
                  disabled={exportingId !== undefined}
                  onPress={() => void exportGpx(i.tourId)}
                  testID={`export-gpx-${i.tourId}`}
                />
                <Text variant="footnote">{t('downloads.exportGpxHint')}</Text>
              </>
            )}
            {exportError === i.tourId && (
              <Text variant="footnote" accessibilityRole="alert">
                {t('downloads.exportGpxFailed')}
              </Text>
            )}
          </View>
        ))}
      </ListGroup>
    </ScrollScreen>
  );
}

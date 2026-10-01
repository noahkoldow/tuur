import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@tuur/shared';
import { Button, IconButton } from '../../../src/components/Button';
import { ListGroup } from '../../../src/components/ListGroup';
import { Mascot } from '../../../src/components/Mascot';
import { ScrollScreen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { getDownloadManager, getFileStore, getOfflineLibrary } from '../../../src/offline';
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
  const total = items.reduce((s, i) => s + i.bytes, 0);

  useEffect(() => {
    void getFileStore().freeBytes().then(setFree);
  }, [items.length]);

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
        <Mascot pose="relax" size={128} />
        <Text variant="title3" align="center">
          {t('downloads.empty')}
        </Text>
        <Text variant="subheadline" align="center">
          {t('downloads.emptyHint')}
        </Text>
      </ScrollScreen>
    );

  return (
    <ScrollScreen>
      <ListGroup footer={footer}>
        {items.map((i) => (
          <View key={i.tourId} style={{ padding: metrics.margin, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline">{i.title}</Text>
                <Text variant="footnote">
                  {`${formatBytes(i.bytes)} · ${i.complete ? t('downloads.downloaded') : t('downloads.partial')}`}
                </Text>
              </View>
              <IconButton
                icon="trash-2"
                label={t('downloads.delete')}
                onPress={() => confirmDelete(i.tourId)}
              />
            </View>
            {!i.complete ? (
              <Button
                variant="tinted"
                size="regular"
                label={t('downloads.resume')}
                onPress={() => router.push({ pathname: '/tour/[id]', params: { id: i.tourId } })}
              />
            ) : null}
          </View>
        ))}
      </ListGroup>
    </ScrollScreen>
  );
}

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@tuur/shared';
import { Mascot } from '../src/components/Mascot';
import { Button, IconButton, Row } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { getDownloadManager, getFileStore, getOfflineLibrary } from '../src/offline';
import { colors, radii } from '../src/theme';

/** Download manager (spec 4.8): list, sizes, free storage, delete. */
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

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
        <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} size={44} />
        <Text variant="title" accessibilityRole="header">
          {t('downloads.title')}
        </Text>
        <View style={{ width: 44 }} />
      </Row>
      <ScrollView contentContainerStyle={{ gap: 14, paddingVertical: 12 }}>
        <Row gap={16}>
          <Text variant="caption">{t('downloads.storage', { size: formatBytes(total) })}</Text>
          {free !== undefined ? (
            <Text variant="caption">{t('downloads.free', { size: formatBytes(free) })}</Text>
          ) : null}
        </Row>
        {items.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
            <Mascot pose="relax" size={128} />
            <Text variant="heading" align="center">
              {t('downloads.empty')}
            </Text>
            <Text variant="bodySecondary" align="center">
              {t('downloads.emptyHint')}
            </Text>
          </View>
        ) : null}
        {items.map((i) => (
          <View
            key={i.tourId}
            style={{
              padding: 14,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 6,
            }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="heading">{i.title}</Text>
                <Text variant="caption">{`${formatBytes(i.bytes)} · ${i.complete ? t('downloads.downloaded') : t('downloads.partial')}`}</Text>
              </View>
              <IconButton
                icon="trash-2"
                label={t('downloads.delete')}
                onPress={() => confirmDelete(i.tourId)}
                size={44}
              />
            </Row>
            {!i.complete ? (
              <Button
                variant="secondary"
                label={t('downloads.resume')}
                onPress={() => router.push({ pathname: '/tour/[id]', params: { id: i.tourId } })}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

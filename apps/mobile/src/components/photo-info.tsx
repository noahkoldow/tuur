import { useState } from 'react';
import { Linking, Pressable, useColorScheme } from 'react-native';
import { BottomSheet, Button, Column, ScrollView, Text } from '@expo/ui';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { attributionUrl, photoAttribution, type PhotoAttribution } from './image-attribution';

export interface PhotoTextSource {
  text: string;
  sourceUrl?: string | undefined;
}

/** The sheet's web portal is outside Host CSS variables, so its controls need explicit colors. */
function CreditButton({ label, onPress }: { label: string; onPress: () => void }) {
  const dark = useColorScheme() === 'dark';
  return (
    <Button
      variant="text"
      onPress={onPress}
      style={{
        height: 48,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: dark ? '#636366' : '#C7C7CC',
        backgroundColor: dark ? '#242426' : '#F2F2F7',
      }}
    >
      <Text textStyle={{ color: dark ? '#FFFFFF' : '#171717', fontSize: 16, fontWeight: '600' }}>
        {label}
      </Text>
    </Button>
  );
}

/** A separate control so photo credits remain reachable without starting a tour or narration. */
export function PhotoInfo({
  image,
  name,
  summary,
}: {
  image?: PhotoAttribution | undefined;
  name: string;
  summary?: PhotoTextSource | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const dark = useColorScheme() === 'dark';
  const ink = { color: dark ? '#FFFFFF' : '#171717' };
  const credit = image ? photoAttribution(image) : undefined;
  const textSourceUrl = attributionUrl(summary?.sourceUrl);
  const openUrl = (url: string) => {
    setLinkError(false);
    void Linking.openURL(url).catch(() => setLinkError(true));
  };
  if (!credit?.license && !credit?.sourceUrl && !summary) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('cards.info')}: ${name}`}
        onPress={(event) => {
          event.stopPropagation();
          setLinkError(false);
          setOpen(true);
        }}
        style={({ pressed }) => ({
          position: 'absolute',
          top: 8,
          right: 8,
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? '#D1D1D6' : '#E5E5EA',
        })}
      >
        <Icon name="info" size={21} color="#48484A" />
      </Pressable>
      {/* BottomSheet supplies its own native Host on iOS and Android. */}
      <BottomSheet
        isPresented={open}
        onDismiss={() => setOpen(false)}
        snapPoints={['half', 'full']}
        containerColor={dark ? '#000000' : '#FFFFFF'}
        testID="photo-info-sheet"
      >
        <ScrollView>
          <Column spacing={12} style={{ paddingBottom: 24 }}>
            <Text textStyle={{ ...ink, fontSize: 20, fontWeight: '700' }}>{name}</Text>
            <Text textStyle={{ ...ink, fontSize: 17 }}>{t('cards.info')}</Text>
            {credit?.license || credit?.sourceUrl ? (
              <Column spacing={8}>
                <Text textStyle={{ ...ink, fontWeight: '600' }}>{t('cards.image')}</Text>
                <Text textStyle={ink}>
                  {t('player.imageBy', {
                    author: credit.author ?? 'Wikimedia Commons',
                    license: credit.license ?? '',
                  }).replace(/,\s*$/, '')}
                </Text>
                {credit.sourceUrl ? (
                  <CreditButton label={t('player.imageSource')} onPress={() => openUrl(credit.sourceUrl!)} />
                ) : null}
                {credit.licenseUrl ? (
                  <CreditButton
                    label={credit.license ?? t('cards.info')}
                    onPress={() => openUrl(credit.licenseUrl!)}
                  />
                ) : null}
              </Column>
            ) : null}
            {summary ? (
              <Column spacing={8}>
                <Text textStyle={{ ...ink, fontWeight: '600' }}>{t('cards.text')}</Text>
                <Text textStyle={ink}>{summary.text}</Text>
                {textSourceUrl ? (
                  <CreditButton
                    label={t('cards.source', { source: 'Wikipedia' })}
                    onPress={() => openUrl(textSourceUrl)}
                  />
                ) : null}
                <CreditButton
                  label="CC BY-SA 4.0"
                  onPress={() => openUrl('https://creativecommons.org/licenses/by-sa/4.0/')}
                />
              </Column>
            ) : null}
            {linkError ? <Text textStyle={ink}>{t('cards.openLinkError')}</Text> : null}
            <CreditButton label={t('common.close')} onPress={() => setOpen(false)} />
          </Column>
        </ScrollView>
      </BottomSheet>
    </>
  );
}

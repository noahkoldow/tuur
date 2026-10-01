import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LEGAL_DOCS, getLegalDocument, type LegalDocId } from '@tuur/shared';
import { ScrollScreen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { config } from '../../src/config';
import { useSettings } from '../../src/state/settings';
import { sys } from '../../src/theme';

/** Imprint, privacy policy and terms: the same texts as on the website (shared package), shown offline. */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const id: LegalDocId = LEGAL_DOCS.includes(doc as LegalDocId) ? (doc as LegalDocId) : 'privacy';
  const d = getLegalDocument(id, language, { ...config.operator, webBaseUrl: config.legal.webBaseUrl });
  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: d.title, headerTransparent: true, headerShadowVisible: false }}
      />
      <ScrollScreen grouped={false} contentContainerStyle={{ gap: 20 }}>
        <Text variant="footnote">{t('account.version', { version: d.version })}</Text>
        {d.sections.map((s) => (
          <View key={s.heading} style={{ gap: 8 }}>
            <Text variant="title3" accessibilityRole="header">
              {s.heading}
            </Text>
            {s.paragraphs.map((p, i) => (
              <Text key={i} variant="body" color={sys.label}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollScreen>
    </>
  );
}

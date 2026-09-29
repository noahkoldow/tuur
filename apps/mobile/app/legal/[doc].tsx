import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LEGAL_DOCS, getLegalDocument, type LegalDocId } from '@tuur/shared';
import { IconButton, Row } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { config } from '../../src/config';
import { useSettings } from '../../src/state/settings';

/** Imprint, privacy policy and terms: the same texts as on the website (shared package), shown offline. */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const language = useSettings((s) => s.language);
  const id: LegalDocId = LEGAL_DOCS.includes(doc as LegalDocId) ? (doc as LegalDocId) : 'privacy';
  const d = getLegalDocument(id, language, { ...config.operator, webBaseUrl: config.legal.webBaseUrl });
  return (
    <Screen>
      <Row style={{ paddingVertical: 8 }}>
        <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} size={44} />
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {d.title}
        </Text>
      </Row>
      <ScrollView contentContainerStyle={{ gap: 18, paddingVertical: 16, paddingBottom: 48 }}>
        <Text variant="caption">{t('account.version', { version: d.version })}</Text>
        {d.sections.map((s) => (
          <View key={s.heading} style={{ gap: 8 }}>
            <Text variant="heading" accessibilityRole="header">
              {s.heading}
            </Text>
            {s.paragraphs.map((p, i) => (
              <Text key={i} variant="body">
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

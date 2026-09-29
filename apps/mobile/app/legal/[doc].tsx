import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconButton, Row } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { config } from '../../src/config';

/** Placeholder pages (spec 10): the operator supplies the real imprint, privacy policy and terms. */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: 'imprint' | 'privacy' | 'terms' }>();
  const { t } = useTranslation();
  const router = useRouter();
  const key = doc === 'imprint' ? 'imprint' : doc === 'terms' ? 'terms' : 'privacy';
  return (
    <Screen>
      <Row style={{ paddingVertical: 8 }}>
        <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} size={44} />
        <Text variant="title" accessibilityRole="header">
          {t(`settings.${key}`)}
        </Text>
      </Row>
      <ScrollView contentContainerStyle={{ gap: 16, paddingVertical: 16 }}>
        <Banner
          text={t('legal.placeholder', {
            url: `${config.legal.webBaseUrl}/${key}`,
            email: config.legal.supportEmail,
          })}
        />
      </ScrollView>
    </Screen>
  );
}

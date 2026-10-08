import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Banner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { ScrollScreen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { config } from '../src/config';
import { sys } from '../src/theme';

/** Support for existing business information. Paid partner services are managed separately on the web. */
export default function Business() {
  const { t } = useTranslation();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const contact = async () => {
    setFailed(false);
    try {
      await Linking.openURL(`mailto:${config.legal.supportEmail}`);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('business.contactTitle'),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: sys.grouped as string },
        }}
      />
      <ScrollScreen>
        <View style={{ gap: 16 }}>
          <Text variant="title1" accessibilityRole="header">
            {t('business.contactTitle')}
          </Text>
          <Text>{t('business.contactBody')}</Text>
          <Text selectable>{config.legal.supportEmail}</Text>
          <Button icon="send" label={t('business.contactAction')} onPress={() => void contact()} />
          {failed ? <Banner tone="warning" text={t('business.contactFailed')} /> : null}
          <Button
            variant="ghost"
            label={t('business.partnerTerms')}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'partner-terms' } })}
          />
          <Button
            variant="ghost"
            label={t('paywall.privacy')}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
          />
        </View>
      </ScrollScreen>
    </>
  );
}

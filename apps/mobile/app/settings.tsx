import { ScrollView, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { INTERESTS, SUPPORTED_UI_LANGUAGES } from '@tuur/shared';
import { Button, IconButton, Row } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { isDev } from '../src/config';
import { useSettings, type NarrationFrequency } from '../src/state/settings';

export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { language, interests, frequency, simulator, set } = useSettings();
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
        <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} size={44} />
        <Text variant="title" accessibilityRole="header">
          {t('settings.title')}
        </Text>
        <View style={{ width: 44 }} />
      </Row>
      <ScrollView contentContainerStyle={{ gap: 22, paddingVertical: 12 }}>
        <Section title={t('settings.language')}>
          <Row gap={8}>
            {SUPPORTED_UI_LANGUAGES.map((l) => (
              <Chip
                key={l}
                label={l === 'de' ? 'Deutsch' : 'English'}
                selected={language === l}
                onPress={() => set({ language: l })}
              />
            ))}
          </Row>
        </Section>
        <Section title={t('settings.interests')}>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {INTERESTS.map((i) => (
              <Chip
                key={i}
                label={t(`interests.${i}`)}
                selected={interests.includes(i)}
                onPress={() =>
                  set({
                    interests: interests.includes(i) ? interests.filter((x) => x !== i) : [...interests, i],
                  })
                }
              />
            ))}
          </Row>
        </Section>
        <Section title={t('settings.frequency')}>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {(['low', 'normal', 'high'] as NarrationFrequency[]).map((f) => (
              <Chip
                key={f}
                label={t(`settings.frequency${f[0]!.toUpperCase()}${f.slice(1)}`)}
                selected={frequency === f}
                onPress={() => set({ frequency: f })}
              />
            ))}
          </Row>
        </Section>
        <Section title={t('downloads.title')}>
          <Button
            variant="secondary"
            icon="download"
            label={t('downloads.title')}
            onPress={() => router.push('/downloads')}
          />
        </Section>
        <Section title={t('settings.legal')}>
          <Button
            variant="secondary"
            label={t('settings.imprint')}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'imprint' } })}
          />
          <Button
            variant="secondary"
            label={t('settings.privacy')}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
          />
          <Button
            variant="secondary"
            label={t('settings.terms')}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
          />
        </Section>
        {isDev ? (
          <Section title={t('settings.developer')}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="body">{t('settings.simulator')}</Text>
              <Switch
                value={simulator}
                onValueChange={(v) => set({ simulator: v })}
                trackColor={{ true: '#ED0516', false: '#E6E6E6' }}
                accessibilityLabel={t('settings.simulator')}
              />
            </Row>
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

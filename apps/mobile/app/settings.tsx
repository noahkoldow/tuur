import { useState } from 'react';
import { Alert, ScrollView, Share, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { INTERESTS, SUPPORTED_UI_LANGUAGES } from '@tuur/shared';
import { getAds } from '../src/billing/entitlements';
import { useBackend } from '../src/backend';
import { Banner } from '../src/components/Banner';
import { Button, IconButton, Row } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { isDev } from '../src/config';
import { setCrashReporting } from '../src/telemetry';
import { endSession } from '../src/guide/session';
import { useSettings, type NarrationFrequency } from '../src/state/settings';

export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { language, interests, frequency, simulator, analyticsConsent, set } = useSettings();
  const backend = useBackend();
  const [notice, setNotice] = useState<{ tone: 'info' | 'warning'; text: string } | undefined>();

  const toggleAnalytics = (v: boolean) => {
    set({ analyticsConsent: v });
    void setCrashReporting(v);
  };
  const adChoices = async () => {
    const shown = await getAds().showPrivacyOptions();
    if (!shown) setNotice({ tone: 'info', text: t('account.adChoicesNone') });
  };
  const exportData = async () => {
    try {
      await backend.auth.ensureSignedIn();
      const data = await backend.exportMyData();
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'tuur-data.json' });
    } catch {
      setNotice({ tone: 'warning', text: t('account.exportFailed') });
    }
  };
  const deleteAccount = () =>
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.deleteConfirm'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await endSession();
              await backend.deleteAccount();
              set({ onboarded: false, interests: [], analyticsConsent: false });
              void setCrashReporting(false);
              router.replace('/');
            } catch {
              setNotice({ tone: 'warning', text: t('account.deleteFailed') });
            }
          })(),
      },
    ]);

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
        <Section title={t('account.title')}>
          {notice ? <Banner tone={notice.tone} text={notice.text} /> : null}
          <Banner icon="cpu" text={t('account.aiInfo')} />
          <Row style={{ justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="body">{t('account.analytics')}</Text>
              <Text variant="caption">{t('account.analyticsHint')}</Text>
            </View>
            <Switch
              value={analyticsConsent}
              onValueChange={toggleAnalytics}
              trackColor={{ true: '#ED0516', false: '#E6E6E6' }}
              accessibilityLabel={t('account.analytics')}
            />
          </Row>
          <Button
            variant="secondary"
            icon="sliders"
            label={t('account.adChoices')}
            onPress={() => void adChoices()}
          />
          <Button
            variant="secondary"
            icon="download"
            label={t('account.export')}
            onPress={() => void exportData()}
          />
          <Button variant="secondary" icon="trash-2" label={t('account.delete')} onPress={deleteAccount} />
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

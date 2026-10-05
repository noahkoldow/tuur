import { useEffect, useState } from 'react';
import { Alert, Linking, Share, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { DEFAULT_VOICE_CAST, INTERESTS, SUPPORTED_UI_LANGUAGES } from '@tuur/shared';
import { getAds } from '../../../src/billing/entitlements';
import { useBackend } from '../../../src/backend';
import { Banner } from '../../../src/components/Banner';
import { BrandMark } from '../../../src/components/Brand';
import { Button } from '../../../src/components/Button';
import { ChoiceRows, ListGroup, ListRow } from '../../../src/components/ListGroup';
import { ScrollScreen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { config, isDev } from '../../../src/config';
import { setCrashReporting } from '../../../src/telemetry';
import { endSession } from '../../../src/guide/session';
import { getDownloadManager } from '../../../src/offline';
import { useHistory } from '../../../src/state/history';
import { useSettings, type NarrationFrequency } from '../../../src/state/settings';
import { metrics, sys } from '../../../src/theme';

/**
 * Settings as grouped lists: tour preferences, privacy (consents, export, deletion), account, legal texts and
 * sources. Every GDPR/store duty (spec 10) is reachable in two taps from home.
 */
export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    language,
    interests,
    frequency,
    simulator,
    analyticsConsent,
    highlightWords,
    voiceId,
    tipsEnabled,
    seenTips,
    set,
  } = useSettings();
  const backend = useBackend();
  const [notice, setNotice] = useState<{ tone: 'info' | 'warning'; text: string } | undefined>();
  const [user, setUser] = useState(backend.auth.current());
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | undefined>();
  const toggle = (id: string) => setOpenPicker((cur) => (cur === id ? undefined : id));

  useEffect(() => backend.auth.onChange(setUser), [backend]);

  const toggleAnalytics = (v: boolean) => {
    set({ analyticsConsent: v });
    void setCrashReporting(v);
  };
  const adChoices = async () => {
    const shown = await getAds().showPrivacyOptions();
    if (!shown) setNotice({ tone: 'info', text: t('account.adChoicesNone') });
  };
  const signOut = async () => {
    try {
      await endSession();
      await backend.auth.signOut();
      router.replace('/');
    } catch {
      setNotice({ tone: 'warning', text: t('errors.generic') });
    }
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
              await getDownloadManager().clearAll();
              await backend.deleteAccount();
              set({ onboarded: false, interests: [], analyticsConsent: false });
              useHistory.getState().clear();
              void setCrashReporting(false);
              router.replace('/');
            } catch {
              setNotice({ tone: 'warning', text: t('account.deleteFailed') });
            }
          })(),
      },
    ]);
  const legal = (doc: 'imprint' | 'privacy' | 'terms') =>
    router.push({ pathname: '/legal/[doc]', params: { doc } });
  const accountName = user?.email ?? user?.phoneNumber;

  return (
    <ScrollScreen>
      {!config.paywall ? <Banner icon="unlock" text={t('settings.previewNotice')} /> : null}
      {notice ? <Banner tone={notice.tone} text={notice.text} /> : null}

      <ListGroup title={t('settings.sectionTour')}>
        <ChoiceRows
          icon="globe"
          label={t('settings.language')}
          choices={SUPPORTED_UI_LANGUAGES.map((l) => ({ id: l, label: l === 'de' ? 'Deutsch' : 'English' }))}
          selected={[language]}
          onChange={([l]) => l && set({ language: l as typeof language })}
          open={openPicker === 'language'}
          onToggle={() => toggle('language')}
        />
        <ChoiceRows
          icon="mic"
          label={t('settings.voice')}
          hint={t('settings.voiceHint')}
          choices={DEFAULT_VOICE_CAST.map((v) => ({
            id: v.id,
            label: v.names[language] ?? v.names['en'] ?? v.id,
            detail: v.blurb[language] ?? v.blurb['en'] ?? '',
          }))}
          selected={[voiceId]}
          onChange={([v]) => v && set({ voiceId: v })}
          open={openPicker === 'voice'}
          onToggle={() => toggle('voice')}
        />
        <ChoiceRows
          icon="heart"
          label={t('settings.interests')}
          hint={t('onboarding.interestsHint')}
          multiple
          choices={INTERESTS.map((i) => ({ id: i, label: t(`interests.${i}`), interest: i }))}
          selected={interests}
          onChange={(next) => set({ interests: next as typeof interests })}
          open={openPicker === 'interests'}
          onToggle={() => toggle('interests')}
        />
        <ChoiceRows
          icon="message-circle"
          label={t('settings.frequency')}
          choices={(['low', 'normal', 'high'] as NarrationFrequency[]).map((f) => ({
            id: f,
            label: t(`settings.frequency${f[0]!.toUpperCase()}${f.slice(1)}`),
          }))}
          selected={[frequency]}
          onChange={([f]) => f && set({ frequency: f as NarrationFrequency })}
          open={openPicker === 'frequency'}
          onToggle={() => toggle('frequency')}
        />
        <ListRow
          icon="type"
          label={t('settings.highlightWords')}
          hint={t('settings.highlightWordsHint')}
          trailing={
            <Switch
              value={highlightWords}
              onValueChange={(v) => set({ highlightWords: v })}
              accessibilityLabel={t('settings.highlightWords')}
            />
          }
        />
        <ListRow
          icon="message-circle"
          label={t('tuu.tipsSetting')}
          hint={t('tuu.tipsHint')}
          trailing={
            <Switch
              value={tipsEnabled}
              onValueChange={(v) => set({ tipsEnabled: v })}
              accessibilityLabel={t('tuu.tipsSetting')}
            />
          }
        />
        {seenTips.length ? (
          <ListRow
            icon="rotate-ccw"
            label={t('tuu.resetTips')}
            onPress={() => {
              set({ seenTips: [], tipsEnabled: true });
              setNotice({ tone: 'info', text: t('tuu.resetTipsDone') });
            }}
          />
        ) : null}
      </ListGroup>

      <ListGroup title={t('settings.sectionPrivacy')} footer={t('account.aiInfo')}>
        <ListRow
          icon="map-pin"
          label={t('settings.location')}
          hint={t('settings.locationHint')}
          external
          onPress={() => void Linking.openSettings()}
        />
        <ListRow
          icon="activity"
          label={t('account.analytics')}
          hint={t('account.analyticsHint')}
          trailing={
            <Switch
              value={analyticsConsent}
              onValueChange={toggleAnalytics}
              accessibilityLabel={t('account.analytics')}
            />
          }
        />
        <ListRow icon="sliders" label={t('account.adChoices')} onPress={() => void adChoices()} />
        <ListRow icon="share" label={t('account.export')} onPress={() => void exportData()} />
      </ListGroup>

      <ListGroup title={t('settings.sectionAccount')}>
        <ListRow
          icon="user"
          label={accountName ? t('settings.signedInAs', { name: accountName }) : t('account.anonymous')}
          {...(user?.isAnonymous !== false
            ? { hint: t('settings.linkAccountHint'), onPress: () => router.replace('/sign-in') }
            : {})}
        />
        {user?.phoneNumber ? (
          <ListRow icon="check-circle" label={t('account.phoneVerifiedAs', { phone: user.phoneNumber })} />
        ) : (
          <ListRow icon="log-in" label={t('auth.signIn')} onPress={() => router.replace('/sign-in')} />
        )}
        <ListRow icon="log-out" label={t('auth.signOut')} onPress={() => void signOut()} />
        <ListRow icon="trash-2" label={t('account.delete')} destructive onPress={deleteAccount} />
      </ListGroup>

      <ListGroup title={t('settings.legal')}>
        <ListRow icon="file-text" label={t('settings.imprint')} onPress={() => legal('imprint')} />
        <ListRow icon="shield" label={t('settings.privacy')} onPress={() => legal('privacy')} />
        <ListRow icon="book-open" label={t('settings.terms')} onPress={() => legal('terms')} />
        <ListRow icon="info" label={t('settings.sources')} onPress={() => setSourcesOpen((o) => !o)} />
        {sourcesOpen ? (
          <View style={{ padding: metrics.margin }}>
            <Text variant="footnote">{t('settings.sourcesBody')}</Text>
          </View>
        ) : null}
      </ListGroup>

      {isDev ? (
        <ListGroup title={t('settings.developer')}>
          <ListRow
            icon="navigation"
            label={t('settings.simulator')}
            trailing={
              <Switch
                value={simulator}
                onValueChange={(v) => set({ simulator: v })}
                accessibilityLabel={t('settings.simulator')}
              />
            }
          />
        </ListGroup>
      ) : null}

      <View style={{ alignItems: 'center', gap: 8 }}>
        <BrandMark size={28} color={sys.labelTertiary} />
      </View>
      <Text variant="footnote" align="center">
        {`tuur · ${t('settings.version', { version: Constants.expoConfig?.version ?? '–' })}`}
      </Text>
      {/* Low-key entry for places that want to collaborate (not aimed at regular listeners). */}
      <Button
        variant="ghost"
        size="regular"
        label={t('business.entry')}
        accessibilityHint={t('business.entryHint')}
        onPress={() => router.push('/business')}
      />
    </ScrollScreen>
  );
}

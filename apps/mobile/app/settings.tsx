import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Share, Switch, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { DEFAULT_VOICE_CAST, INTERESTS, SUPPORTED_UI_LANGUAGES } from '@tuur/shared';
import { getAds } from '../src/billing/entitlements';
import { useBackend } from '../src/backend';
import { AppleSignInButton } from '../src/components/AppleSignInButton';
import { Banner } from '../src/components/Banner';
import { Button, IconButton, Row } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { ListGroup, ListRow } from '../src/components/ListGroup';
import { Text } from '../src/components/Text';
import { config, isDev } from '../src/config';
import { setCrashReporting } from '../src/telemetry';
import { endSession } from '../src/guide/session';
import { useHistory } from '../src/state/history';
import { useSettings, type NarrationFrequency } from '../src/state/settings';
import { colors, radii } from '../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Settings as grouped lists: tour preferences, privacy (consents, export, deletion), account, legal texts and
 * sources. Every GDPR/store duty (spec 10) is reachable in two taps from home.
 */
export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, interests, frequency, simulator, analyticsConsent, highlightWords, voiceId, set } =
    useSettings();
  const backend = useBackend();
  const [notice, setNotice] = useState<{ tone: 'info' | 'warning'; text: string } | undefined>();
  const [user, setUser] = useState(backend.auth.current());
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneVerificationId, setPhoneVerificationId] = useState<string>();
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  useEffect(() => backend.auth.onChange(setUser), [backend]);

  const requestPhoneCode = async () => {
    setPhoneBusy(true);
    setNotice(undefined);
    try {
      setPhoneVerificationId(await backend.auth.requestPhoneVerification(phoneNumber.trim()));
      setNotice({ tone: 'info', text: t('account.phoneCodeSent') });
    } catch {
      setNotice({ tone: 'warning', text: t('account.phoneFailed') });
    } finally {
      setPhoneBusy(false);
    }
  };

  const confirmPhoneCode = async () => {
    if (!phoneVerificationId) return;
    setPhoneBusy(true);
    setNotice(undefined);
    try {
      setUser(await backend.auth.confirmPhoneVerification(phoneVerificationId, phoneCode.trim()));
      setPhoneVerificationId(undefined);
      setPhoneCode('');
      setPhoneOpen(false);
      setNotice({ tone: 'info', text: t('account.phoneVerified') });
    } catch {
      setNotice({ tone: 'warning', text: t('account.phoneFailed') });
    } finally {
      setPhoneBusy(false);
    }
  };

  const signIn = async (f: () => Promise<unknown>) => {
    setNotice(undefined);
    try {
      await f();
    } catch {
      setNotice({ tone: 'warning', text: t('errors.generic') });
    }
  };

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
    <View style={{ flex: 1, backgroundColor: colors.surface.subtle, paddingTop: insets.top }}>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 16 }}>
        <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} size={44} />
        <Text variant="title" accessibilityRole="header">
          {t('settings.title')}
        </Text>
        <View style={{ width: 44 }} />
      </Row>
      <ScrollView contentContainerStyle={{ gap: 24, padding: 16, paddingBottom: insets.bottom + 32 }}>
        {!config.paywall ? <Banner icon="unlock" text={t('settings.previewNotice')} /> : null}
        {notice ? <Banner tone={notice.tone} text={notice.text} /> : null}

        <ListGroup title={t('settings.sectionTour')}>
          <Picker icon="globe" label={t('settings.language')}>
            {SUPPORTED_UI_LANGUAGES.map((l) => (
              <Chip
                key={l}
                label={l === 'de' ? 'Deutsch' : 'English'}
                selected={language === l}
                onPress={() => set({ language: l })}
              />
            ))}
          </Picker>
          <Picker icon="mic" label={t('settings.voice')} hint={t('settings.voiceHint')}>
            {DEFAULT_VOICE_CAST.map((v) => (
              <Chip
                key={v.id}
                label={`${v.names[language] ?? v.names['en']} · ${v.blurb[language] ?? v.blurb['en']}`}
                selected={voiceId === v.id}
                onPress={() => set({ voiceId: v.id })}
              />
            ))}
          </Picker>
          <Picker icon="heart" label={t('settings.interests')} hint={t('onboarding.interestsHint')}>
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
          </Picker>
          <Picker icon="message-circle" label={t('settings.frequency')}>
            {(['low', 'normal', 'high'] as NarrationFrequency[]).map((f) => (
              <Chip
                key={f}
                label={t(`settings.frequency${f[0]!.toUpperCase()}${f.slice(1)}`)}
                selected={frequency === f}
                onPress={() => set({ frequency: f })}
              />
            ))}
          </Picker>
          <ListRow
            icon="type"
            label={t('settings.highlightWords')}
            hint={t('settings.highlightWordsHint')}
            trailing={
              <Switch
                value={highlightWords}
                onValueChange={(v) => set({ highlightWords: v })}
                trackColor={{ true: colors.brand.red, false: colors.border }}
                accessibilityLabel={t('settings.highlightWords')}
              />
            }
          />
          <ListRow icon="download" label={t('downloads.title')} onPress={() => router.push('/downloads')} />
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
                trackColor={{ true: colors.brand.red, false: colors.border }}
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
            {...(user?.isAnonymous !== false ? { hint: t('settings.linkAccountHint') } : {})}
          />
          {user?.isAnonymous !== false && (Platform.OS === 'ios' || backend.kind === 'demo') ? (
            <View style={{ padding: 14 }}>
              <AppleSignInButton
                label={t('onboarding.signInApple')}
                onPress={() => void signIn(() => backend.auth.signInWithApple())}
              />
            </View>
          ) : null}
          {user?.isAnonymous !== false ? (
            <ListRow
              icon="log-in"
              label={t('onboarding.signInGoogle')}
              onPress={() => void signIn(() => backend.auth.signInWithGoogle())}
            />
          ) : null}
          {user?.phoneNumber ? (
            <ListRow icon="check-circle" label={t('account.phoneVerifiedAs', { phone: user.phoneNumber })} />
          ) : (
            <ListRow icon="phone" label={t('account.phoneTitle')} onPress={() => setPhoneOpen((o) => !o)} />
          )}
          {phoneOpen && !user?.phoneNumber ? (
            <View style={{ padding: 14, gap: 10 }}>
              <Text variant="caption">{t('account.phoneHint')}</Text>
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder={t('account.phonePlaceholder')}
                keyboardType="phone-pad"
                autoComplete="tel"
                accessibilityLabel={t('account.phoneTitle')}
                style={inputStyle}
              />
              {phoneVerificationId ? (
                <>
                  <TextInput
                    value={phoneCode}
                    onChangeText={setPhoneCode}
                    placeholder={t('account.phoneCodePlaceholder')}
                    keyboardType="number-pad"
                    autoComplete="sms-otp"
                    accessibilityLabel={t('account.phoneCodePlaceholder')}
                    style={inputStyle}
                  />
                  <Button
                    label={t('account.phoneConfirm')}
                    loading={phoneBusy}
                    disabled={phoneCode.trim().length < 4}
                    onPress={() => void confirmPhoneCode()}
                  />
                </>
              ) : (
                <Button
                  variant="secondary"
                  label={t('account.phoneSendCode')}
                  loading={phoneBusy}
                  disabled={!phoneNumber.trim()}
                  onPress={() => void requestPhoneCode()}
                />
              )}
            </View>
          ) : null}
          <ListRow icon="trash-2" label={t('account.delete')} destructive onPress={deleteAccount} />
        </ListGroup>

        <ListGroup title={t('settings.legal')}>
          <ListRow icon="file-text" label={t('settings.imprint')} onPress={() => legal('imprint')} />
          <ListRow icon="shield" label={t('settings.privacy')} onPress={() => legal('privacy')} />
          <ListRow icon="book-open" label={t('settings.terms')} onPress={() => legal('terms')} />
          <ListRow icon="info" label={t('settings.sources')} onPress={() => setSourcesOpen((o) => !o)} />
          {sourcesOpen ? (
            <View style={{ padding: 14 }}>
              <Text variant="caption">{t('settings.sourcesBody')}</Text>
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
                  trackColor={{ true: colors.brand.red, false: colors.border }}
                  accessibilityLabel={t('settings.simulator')}
                />
              }
            />
          </ListGroup>
        ) : null}

        <Text variant="caption" align="center">
          {`tuur · ${t('settings.version', { version: Constants.expoConfig?.version ?? '–' })}`}
        </Text>
        {/* Low-key entry for places that want to collaborate (not aimed at regular listeners). */}
        <Button
          variant="ghost"
          label={t('business.entry')}
          accessibilityHint={t('business.entryHint')}
          onPress={() => router.push('/business')}
          style={{ minHeight: 44 }}
        />
      </ScrollView>
    </View>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radii.sm,
  padding: 12,
  fontSize: 16,
  color: colors.ink.primary,
} as const;

/** A settings row whose options (chips) sit below the label. */
function Picker({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ComponentProps<typeof ListRow>['icon'];
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingBottom: 14 }}>
      <ListRow icon={icon} label={label} {...(hint ? { hint } : {})} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 60, paddingRight: 14 }}>
        {children}
      </View>
    </View>
  );
}

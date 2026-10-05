import { useEffect, useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useBackend } from '../src/backend';
import { authErrorKey, normalizedPhone, validPhone } from '../src/auth/policy';
import { useAuth } from '../src/auth/session';
import { AppleSignInButton } from '../src/components/AppleSignInButton';
import { Banner } from '../src/components/Banner';
import { Wordmark } from '../src/components/Brand';
import { Button, Row } from '../src/components/Button';
import { ScrollScreen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { useSettings } from '../src/state/settings';
import { metrics, sys } from '../src/theme';

/** A required account step followed by a Firebase-linked SMS credential. No local flag grants entry. */
export default function SignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { user, step, updateUser } = useAuth();
  const language = useSettings((s) => s.language);
  const [create, setCreate] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{ id: string; phone: string }>();
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<string>();
  const nativePhoneUnavailable =
    backend.kind !== 'demo' && Platform.OS !== 'web' && Constants.appOwnership === 'expo';
  const showApple =
    !nativePhoneUnavailable && (Platform.OS === 'ios' || Platform.OS === 'web' || backend.kind === 'demo');
  const showGoogle = !nativePhoneUnavailable;

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    setChallenge(undefined);
    setCode('');
    setPhone('');
    setCooldown(0);
    setError(undefined);
  }, [user?.uid]);

  const run = async (action: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      const key = authErrorKey(e);
      if (key) setError(t(key));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      if (!validPhone(phone)) {
        setError(t('auth.invalidPhone'));
        return;
      }
      const number = normalizedPhone(phone);
      const uid = backend.auth.current()?.uid;
      const id = await backend.auth.requestPhoneVerification(number);
      if (backend.auth.current()?.uid !== uid) return;
      const verified = backend.auth.current();
      if (verified?.phoneNumber) {
        updateUser(verified);
        return;
      }
      setChallenge({ id, phone: number });
      setCode('');
      setCooldown(60);
    });

  const fieldStyle = {
    minHeight: 50,
    padding: 14,
    borderRadius: metrics.radius.card,
    backgroundColor: sys.elevated,
    color: sys.label,
    fontSize: 17,
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t(step === 'phone' ? 'auth.phoneTitle' : 'auth.title'),
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <ScrollScreen grouped={false} contentContainerStyle={{ flexGrow: 1, gap: 20 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Wordmark width={92} />
          <Button
            variant="ghost"
            size="regular"
            label={language === 'de' ? 'English' : 'Deutsch'}
            onPress={() => useSettings.getState().set({ language: language === 'de' ? 'en' : 'de' })}
          />
        </Row>
        <Text variant="body" color={sys.labelSecondary}>
          {t(step === 'phone' ? 'auth.phoneBody' : 'auth.body')}
        </Text>
        {backend.kind === 'demo' ? <Banner text={t('auth.demo')} /> : null}
        {error ? <Banner tone="error" text={error} /> : null}
        {step === 'phone' ? (
          <View style={{ gap: 14 }}>
            <Text variant="footnote" selectable>
              {user?.email}
            </Text>
            {nativePhoneUnavailable ? <Banner tone="warning" text={t('auth.nativeRequired')} /> : null}
            <Text variant="headline">{t('account.phoneTitle')}</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              editable={!busy && !challenge}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              placeholder={t('account.phonePlaceholder')}
              placeholderTextColor={sys.labelSecondary}
              accessibilityLabel={t('account.phoneTitle')}
              style={fieldStyle}
            />
            {challenge ? (
              <>
                <Text variant="footnote" selectable>
                  {t('auth.phoneSent', { phone: challenge.phone })}
                </Text>
                <TextInput
                  value={code}
                  onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
                  editable={!busy}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={6}
                  placeholder={t('account.phoneCodePlaceholder')}
                  placeholderTextColor={sys.labelSecondary}
                  accessibilityLabel={t('account.phoneCodePlaceholder')}
                  style={fieldStyle}
                />
                <Button
                  label={t('account.phoneConfirm')}
                  loading={busy}
                  disabled={code.length !== 6}
                  onPress={() =>
                    void run(async () =>
                      updateUser(await backend.auth.confirmPhoneVerification(challenge.id, code)),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  label={cooldown ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
                  disabled={busy || cooldown > 0}
                  onPress={() => void sendCode()}
                />
                <Button
                  variant="ghost"
                  label={t('auth.changePhone')}
                  disabled={busy}
                  onPress={() => {
                    setChallenge(undefined);
                    setCode('');
                    setError(undefined);
                  }}
                />
              </>
            ) : (
              <>
                <Text variant="footnote">{t('auth.phoneConsent')}</Text>
                <Button
                  label={cooldown ? t('auth.resendIn', { seconds: cooldown }) : t('account.phoneSendCode')}
                  loading={busy}
                  disabled={!phone.trim() || nativePhoneUnavailable || cooldown > 0}
                  onPress={() => void sendCode()}
                />
              </>
            )}
            <Button
              variant="ghost"
              label={t('auth.otherAccount')}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await backend.auth.signOut();
                  updateUser(null);
                  setChallenge(undefined);
                  setCode('');
                  setPassword('');
                })
              }
            />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {showApple ? (
              <AppleSignInButton
                label={t('onboarding.signInApple')}
                busy={busy}
                onPress={() => void run(async () => updateUser(await backend.auth.signInWithApple()))}
              />
            ) : null}
            {showGoogle ? (
              <Button
                variant="secondary"
                label={t('onboarding.signInGoogle')}
                disabled={busy}
                onPress={() => void run(async () => updateUser(await backend.auth.signInWithGoogle()))}
              />
            ) : null}
            <Text variant="headline" style={{ marginTop: 10 }}>
              {t('onboarding.signInEmail')}
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              placeholder={t('auth.email')}
              placeholderTextColor={sys.labelSecondary}
              accessibilityLabel={t('auth.email')}
              style={fieldStyle}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType={create ? 'newPassword' : 'password'}
              autoComplete={create ? 'new-password' : 'current-password'}
              placeholder={t('auth.password')}
              placeholderTextColor={sys.labelSecondary}
              accessibilityLabel={t('auth.password')}
              style={fieldStyle}
            />
            <Button
              label={t(create ? 'auth.create' : 'auth.signIn')}
              loading={busy}
              disabled={!email.trim() || !password}
              onPress={() =>
                void run(async () => {
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
                    return setError(t('auth.invalidEmail'));
                  if (create && password.length < 6) return setError(t('auth.weakPassword'));
                  updateUser(await backend.auth.signInWithEmail(email.trim(), password, create));
                  setPassword('');
                })
              }
            />
            <Button
              variant="ghost"
              label={t(create ? 'auth.signInHint' : 'auth.createHint')}
              disabled={busy}
              onPress={() => {
                setCreate((value) => !value);
                setError(undefined);
              }}
            />
          </View>
        )}
        <View style={{ marginTop: 'auto', gap: 8 }}>
          <Text variant="footnote" align="center">
            {t('onboarding.legalConsent')}
          </Text>
          <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="ghost"
              size="regular"
              label={t('onboarding.legalTerms')}
              onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
            />
            <Button
              variant="ghost"
              size="regular"
              label={t('onboarding.legalPrivacy')}
              onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
            />
          </Row>
        </View>
      </ScrollScreen>
    </>
  );
}

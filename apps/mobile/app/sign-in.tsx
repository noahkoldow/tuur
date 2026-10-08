import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useBackend } from '../src/backend';
import { authErrorKey, normalizedPhone, validPhone } from '../src/auth/policy';
import { useAuth } from '../src/auth/session';
import { AppleSignInButton } from '../src/components/AppleSignInButton';
import { Wordmark } from '../src/components/Brand';
import { Button, IconButton, Row } from '../src/components/Button';
import { Mascot } from '../src/components/Mascot';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { useSettings } from '../src/state/settings';
import { metrics, spacing, sys, type } from '../src/theme';

/** Primary sign-in and separately requested, optional mobile verification. */
export default function SignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { user, step, updateUser } = useAuth();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phoneVerification = params.phone === '1' && step === 'ready';
  const language = useSettings((s) => s.language);
  const [create, setCreate] = useState(true);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const passwordInput = useRef<TextInput>(null);
  const { height, fontScale } = useWindowDimensions();
  const [availableHeight, setAvailableHeight] = useState(height);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [reviewPhone, setReviewPhone] = useState(false);
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
  const isWelcome = !phoneVerification && !emailExpanded;
  const compact = availableHeight / fontScale < 720;
  const gap = compact ? spacing.xs : spacing.sm;
  const title = t(
    phoneVerification
      ? reviewPhone && !challenge
        ? 'auth.phoneReviewTitle'
        : 'auth.phoneTitle'
      : isWelcome
        ? 'auth.welcomeHeadline'
        : create
          ? 'auth.emailCreateTitle'
          : 'auth.emailSignInTitle',
  );
  const backToPhone = useCallback(() => {
    Keyboard.dismiss();
    setChallenge(undefined);
    setReviewPhone(false);
    setCode('');
    setError(undefined);
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (step === 'ready' && (!phoneVerification || user?.phoneNumber)) router.replace('/');
  }, [step, phoneVerification, user?.phoneNumber, router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phoneVerification && (reviewPhone || challenge)) {
        if (!running.current) backToPhone();
        return true;
      }
      if (!emailExpanded || phoneVerification) return false;
      if (!running.current) {
        Keyboard.dismiss();
        setEmailExpanded(false);
        setError(undefined);
      }
      return true;
    });
    return () => subscription.remove();
  }, [emailExpanded, phoneVerification, reviewPhone, challenge, backToPhone]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    setChallenge(undefined);
    setCode('');
    setPhone('');
    setReviewPhone(false);
    setCooldown(0);
    setError(undefined);
  }, [user?.uid]);

  const run = async (action: () => Promise<unknown>) => {
    if (running.current) return;
    Keyboard.dismiss();
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

  const submitEmail = () =>
    run(async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t('auth.invalidEmail'));
      if (create && password.length < 6) return setError(t('auth.weakPassword'));
      updateUser(await backend.auth.signInWithEmail(email.trim(), password, create));
      setPassword('');
    });

  const fieldStyle = {
    ...type.body,
    minHeight: metrics.hit,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: metrics.radius.card,
    borderCurve: 'continuous' as const,
    backgroundColor: sys.fill,
    color: sys.label,
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title: t(phoneVerification ? 'auth.phoneTitle' : 'auth.title'),
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: sys.background }}
      >
        <Screen style={keyboardVisible ? { paddingBottom: 0 } : undefined}>
          <View
            onLayout={(event) => setAvailableHeight(event.nativeEvent.layout.height)}
            testID="sign-in-content"
            style={{
              flex: 1,
              minHeight: 0,
              gap: compact ? spacing.sm : spacing.md,
              paddingVertical: spacing.xs,
              width: '100%',
              maxWidth: 480,
              alignSelf: 'center',
            }}
          >
            <Row style={{ justifyContent: 'space-between', minHeight: metrics.hit }}>
              {(emailExpanded && !phoneVerification) || (phoneVerification && (reviewPhone || challenge)) ? (
                <IconButton
                  icon="arrow-left"
                  label={t('common.back')}
                  disabled={busy}
                  onPress={() => {
                    if (phoneVerification) {
                      backToPhone();
                      return;
                    }
                    Keyboard.dismiss();
                    setEmailExpanded(false);
                    setError(undefined);
                  }}
                />
              ) : (
                <Wordmark width={80} />
              )}
              {keyboardVisible ? (
                <IconButton
                  icon="check"
                  label={t('auth.dismissKeyboard')}
                  onPress={() => Keyboard.dismiss()}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="regular"
                  label={language === 'de' ? 'English' : 'Deutsch'}
                  disabled={busy}
                  onPress={() => useSettings.getState().set({ language: language === 'de' ? 'en' : 'de' })}
                />
              )}
            </Row>
            {!keyboardVisible ? (
              <View
                style={{
                  gap: compact ? spacing.sm : spacing.md,
                  flexGrow: isWelcome ? 1 : 0,
                  flexShrink: 1,
                  justifyContent: 'center',
                  alignItems: isWelcome ? 'center' : 'stretch',
                }}
              >
                <View
                  style={{
                    flexDirection: isWelcome && compact ? 'row' : 'column',
                    alignItems: isWelcome ? 'center' : 'stretch',
                    gap: spacing.sm,
                    width: '100%',
                  }}
                >
                  {isWelcome ? (
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={{
                        width: compact ? 64 : 128,
                        height: compact ? 64 : 128,
                        borderRadius: 64,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: sys.accentTint,
                      }}
                    >
                      <Mascot pose="wave" size={compact ? 64 : 124} idle={false} entrance={false} />
                    </View>
                  ) : null}
                  <Text
                    accessibilityRole="header"
                    variant={compact ? 'title2' : 'largeTitle'}
                    align={isWelcome && !compact ? 'center' : 'left'}
                    style={{ flexShrink: 1 }}
                  >
                    {title}
                  </Text>
                </View>
                {!phoneVerification || (!reviewPhone && !challenge) ? (
                  <Text
                    variant={compact ? 'subheadline' : 'body'}
                    color={sys.labelSecondary}
                    align={isWelcome ? 'center' : 'left'}
                  >
                    {t(phoneVerification ? 'auth.phoneBody' : isWelcome ? 'auth.welcomeBody' : 'auth.body')}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {error ? (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                variant="footnote"
                color={sys.error}
                selectable
              >
                {error}
              </Text>
            ) : null}
            {phoneVerification ? (
              <View style={{ gap }}>
                {!keyboardVisible && !reviewPhone && !challenge ? (
                  <Text variant="footnote" selectable>
                    {user?.email}
                  </Text>
                ) : null}
                {nativePhoneUnavailable ? (
                  <Text variant="footnote" color={sys.warning}>
                    {t('auth.nativeRequired')}
                  </Text>
                ) : null}
                {!challenge && !reviewPhone ? (
                  <>
                    {!keyboardVisible ? <Text variant="headline">{t('account.phoneTitle')}</Text> : null}
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
                  </>
                ) : null}
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
                    <Row gap={spacing.sm}>
                      <AuthLink
                        label={cooldown ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
                        disabled={busy || cooldown > 0}
                        onPress={() => void sendCode()}
                      />
                      <AuthLink label={t('auth.changePhone')} disabled={busy} onPress={backToPhone} />
                    </Row>
                  </>
                ) : reviewPhone ? (
                  <>
                    <Row gap={spacing.sm}>
                      <Text variant="subheadline" selectable style={{ flex: 1 }}>
                        {normalizedPhone(phone)}
                      </Text>
                      <AuthLink label={t('auth.changePhone')} disabled={busy} onPress={backToPhone} />
                    </Row>
                    <Text variant="footnote">{t('auth.phoneConsent')}</Text>
                    {user?.providerIds?.includes('apple.com') ? (
                      <Text variant="footnote">{t('auth.applePhoneConsent')}</Text>
                    ) : null}
                    <Button
                      label={
                        cooldown ? t('auth.resendIn', { seconds: cooldown }) : t('account.phoneSendCode')
                      }
                      loading={busy}
                      disabled={!phone.trim() || nativePhoneUnavailable || cooldown > 0}
                      onPress={() => void sendCode()}
                    />
                  </>
                ) : (
                  <Button
                    label={t('auth.reviewPhone')}
                    disabled={!phone.trim() || nativePhoneUnavailable || busy}
                    onPress={() => {
                      Keyboard.dismiss();
                      if (!validPhone(phone)) {
                        setError(t('auth.invalidPhone'));
                        return;
                      }
                      setError(undefined);
                      setReviewPhone(true);
                    }}
                  />
                )}
                <Row gap={spacing.sm}>
                  <AuthLink label={t('auth.skipPhone')} disabled={busy} onPress={() => router.replace('/')} />
                  <AuthLink
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
                </Row>
              </View>
            ) : (
              <View style={{ gap }}>
                {isWelcome && showApple ? (
                  <AppleSignInButton
                    label={t('onboarding.signInApple')}
                    busy={busy}
                    onPress={() => void run(async () => updateUser(await backend.auth.signInWithApple()))}
                  />
                ) : null}
                {isWelcome && showGoogle ? (
                  <Button
                    variant="secondary"
                    label={t('onboarding.signInGoogle')}
                    disabled={busy}
                    onPress={() => void run(async () => updateUser(await backend.auth.signInWithGoogle()))}
                  />
                ) : null}
                {isWelcome ? (
                  <>
                    <Button
                      variant="primary"
                      icon="mail"
                      label={t('auth.continueEmail')}
                      disabled={busy}
                      onPress={() => {
                        setCreate(true);
                        setEmailExpanded(true);
                        setError(undefined);
                      }}
                    />
                    <Button
                      size="regular"
                      variant="ghost"
                      label={t('auth.signInHint')}
                      disabled={busy}
                      onPress={() => {
                        setCreate(false);
                        setEmailExpanded(true);
                        setError(undefined);
                      }}
                    />
                    <Text variant="footnote" align="center">
                      {t('auth.setupHint')}
                    </Text>
                  </>
                ) : (
                  <>
                    {!keyboardVisible ? <Text variant="label">{t('auth.email')}</Text> : null}
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      editable={!busy}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      autoComplete="email"
                      returnKeyType="next"
                      onSubmitEditing={() => passwordInput.current?.focus()}
                      placeholder={t('auth.email')}
                      placeholderTextColor={sys.labelSecondary}
                      accessibilityLabel={t('auth.email')}
                      style={fieldStyle}
                    />
                    {!keyboardVisible ? <Text variant="label">{t('auth.password')}</Text> : null}
                    <TextInput
                      ref={passwordInput}
                      value={password}
                      onChangeText={setPassword}
                      editable={!busy}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      textContentType={create ? 'newPassword' : 'password'}
                      autoComplete={create ? 'new-password' : 'current-password'}
                      returnKeyType="go"
                      onSubmitEditing={() => {
                        if (email.trim() && password) void submitEmail();
                      }}
                      placeholder={t('auth.password')}
                      placeholderTextColor={sys.labelSecondary}
                      accessibilityLabel={t('auth.password')}
                      style={fieldStyle}
                    />
                    <Button
                      label={t(create ? 'auth.create' : 'auth.signIn')}
                      loading={busy}
                      disabled={!email.trim() || !password}
                      onPress={() => void submitEmail()}
                    />
                    {!keyboardVisible ? (
                      <Button
                        size="regular"
                        variant="ghost"
                        label={t(create ? 'auth.signInHint' : 'auth.createHint')}
                        disabled={busy}
                        onPress={() => {
                          setCreate((value) => !value);
                          setError(undefined);
                        }}
                      />
                    ) : null}
                  </>
                )}
              </View>
            )}
            {!keyboardVisible ? (
              <View style={{ marginTop: 'auto', gap: spacing.xs }}>
                {backend.kind === 'demo' ? (
                  <Text variant="caption" align="center" selectable>
                    {t(phoneVerification ? 'auth.demoPhone' : 'auth.demoSignIn')}
                  </Text>
                ) : null}
                {!phoneVerification ? (
                  <Text variant="caption" align="center">
                    {t('onboarding.legalConsent')}
                  </Text>
                ) : null}
                <Row gap={spacing.sm} style={{ justifyContent: 'center' }}>
                  {(['terms', 'privacy'] as const).map((doc) => (
                    <Pressable
                      key={doc}
                      accessibilityRole="link"
                      onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })}
                      style={{
                        minHeight: metrics.hit,
                        flexShrink: 1,
                        paddingHorizontal: spacing.sm,
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="caption" color={sys.accentText} align="center">
                        {t(doc === 'terms' ? 'onboarding.legalTerms' : 'onboarding.legalPrivacy')}
                      </Text>
                    </Pressable>
                  ))}
                  {user ? (
                    <Pressable
                      accessibilityRole="link"
                      disabled={busy}
                      onPress={() => router.push('/account/delete')}
                      style={{
                        minHeight: metrics.hit,
                        flexShrink: 1,
                        paddingHorizontal: spacing.sm,
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="caption" color={sys.accentText} align="center">
                        {t('account.delete')}
                      </Text>
                    </Pressable>
                  ) : null}
                </Row>
              </View>
            ) : null}
          </View>
        </Screen>
      </KeyboardAvoidingView>
    </>
  );
}

/** Secondary phone actions share a row while retaining a full-size touch target. */
function AuthLink({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: metrics.hit,
        paddingVertical: spacing.xs,
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Text variant="footnote" color={sys.accentText} align="center">
        {label}
      </Text>
    </Pressable>
  );
}

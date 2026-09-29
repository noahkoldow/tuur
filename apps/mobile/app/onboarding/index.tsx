import { useState } from 'react';
import { Image, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { INTERESTS, SUPPORTED_UI_LANGUAGES, type Interest, type UiLanguage } from '@tuur/shared';
import { useBackend } from '../../src/backend';
import { Banner } from '../../src/components/Banner';
import { Button, Row } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { Screen } from '../../src/components/Screen';
import { SpinningMark } from '../../src/components/SpinningMark';
import { Text } from '../../src/components/Text';
import { requestForeground } from '../../src/location/real';
import { useSettings } from '../../src/state/settings';
import wordmark from '../../assets/wordmark-red.png';
import { colors, radii } from '../../src/theme';

type Step = 'welcome' | 'language' | 'interests' | 'permissions' | 'account' | 'safety';
const ORDER: Step[] = ['welcome', 'language', 'interests', 'permissions', 'account', 'safety'];
const LANGUAGE_NAMES: Record<UiLanguage, string> = { de: 'Deutsch', en: 'English' };

/** Onboarding (spec 11): logo -> language -> interests (skippable) -> permissions with explanation -> optional login. */
export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { language, interests, set } = useSettings();
  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const idx = ORDER.indexOf(step);
  const next = () => setStep(ORDER[Math.min(ORDER.length - 1, idx + 1)]!);
  const back = () => idx > 0 && setStep(ORDER[idx - 1]!);

  const finish = () => {
    set({ onboarded: true });
    router.replace('/home');
  };

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await f();
      next();
    } catch (e) {
      setError((e as Error).message || t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }}
      >
        {idx > 0 ? <Button variant="ghost" label={t('common.back')} onPress={back} /> : <View />}
        <Row gap={6}>
          {ORDER.map((s, i) => (
            <View
              key={s}
              style={{
                width: i === idx ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i <= idx ? colors.brand.red : colors.border,
              }}
            />
          ))}
        </Row>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20, paddingVertical: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 'welcome' && (
          <View style={{ alignItems: 'center', gap: 28 }}>
            <SpinningMark size={120} label={t('loading.loading')} />
            <Image
              accessibilityLabel="tuur"
              source={wordmark}
              style={{ width: 200, height: 72 }}
              resizeMode="contain"
            />
            <Text variant="title" align="center">
              {t('onboarding.welcomeTitle')}
            </Text>
            <Text variant="bodySecondary" align="center">
              {t('onboarding.welcomeBody')}
            </Text>
          </View>
        )}

        {step === 'language' && (
          <View style={{ gap: 16 }}>
            <Text variant="title">{t('onboarding.languageTitle')}</Text>
            <Text variant="bodySecondary">{t('onboarding.languageHint')}</Text>
            {SUPPORTED_UI_LANGUAGES.map((l) => (
              <Button
                key={l}
                variant={language === l ? 'primary' : 'secondary'}
                label={LANGUAGE_NAMES[l]}
                onPress={() => set({ language: l })}
              />
            ))}
          </View>
        )}

        {step === 'interests' && (
          <View style={{ gap: 16 }}>
            <Text variant="title">{t('onboarding.interestsTitle')}</Text>
            <Text variant="bodySecondary">{t('onboarding.interestsHint')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {INTERESTS.map((i) => (
                <Chip
                  key={i}
                  label={t(`interests.${i}`)}
                  selected={interests.includes(i)}
                  onPress={() =>
                    set({
                      interests: interests.includes(i)
                        ? interests.filter((x: Interest) => x !== i)
                        : [...interests, i],
                    })
                  }
                />
              ))}
            </View>
          </View>
        )}

        {step === 'permissions' && (
          <View style={{ gap: 16 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: radii.lg,
                backgroundColor: colors.brand.redTint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
            <Text variant="title">{t('onboarding.permissionsTitle')}</Text>
            <Text variant="body">{t('onboarding.permissionsBody')}</Text>
            <Banner text={t('onboarding.permissionsBackground')} />
          </View>
        )}

        {step === 'account' && (
          <View style={{ gap: 14 }}>
            <Text variant="title">{t('onboarding.accountTitle')}</Text>
            <Text variant="bodySecondary">{t('onboarding.accountBody')}</Text>
            {Platform.OS === 'ios' || backend.kind === 'demo' ? (
              <Button
                variant="secondary"
                icon="smartphone"
                label={t('onboarding.signInApple')}
                loading={busy}
                onPress={() => void run(() => backend.auth.signInWithApple())}
              />
            ) : null}
            <Button
              variant="secondary"
              icon="log-in"
              label={t('onboarding.signInGoogle')}
              loading={busy}
              onPress={() => void run(() => backend.auth.signInWithGoogle())}
            />
            {error ? <Banner tone="error" text={error} /> : null}
          </View>
        )}

        {step === 'safety' && (
          <View style={{ gap: 16 }}>
            <Banner tone="warning" text={t('onboarding.safetyBody')} />
            <Text variant="title">{t('onboarding.safetyTitle')}</Text>
          </View>
        )}
      </ScrollView>

      <View style={{ gap: 10, paddingBottom: 16 }}>
        {step === 'permissions' ? (
          <>
            <Button
              label={t('onboarding.allowLocation')}
              loading={busy}
              onPress={() => void run(() => requestForeground())}
            />
            <Button variant="ghost" label={t('onboarding.notNow')} onPress={next} />
          </>
        ) : step === 'account' ? (
          <Button
            label={t('onboarding.startAnonymous')}
            loading={busy}
            onPress={() => void run(() => backend.auth.ensureSignedIn())}
          />
        ) : step === 'safety' ? (
          <Button label={t('onboarding.safetyOk')} onPress={finish} />
        ) : (
          <>
            <Button label={t('common.continue')} onPress={next} />
            {step === 'interests' ? <Button variant="ghost" label={t('common.skip')} onPress={next} /> : null}
          </>
        )}
      </View>
    </Screen>
  );
}

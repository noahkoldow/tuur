import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Image, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { INTERESTS, SUPPORTED_UI_LANGUAGES, type Interest, type UiLanguage } from '@tuur/shared';
import { BackendError, useBackend } from '../../src/backend';
import { Banner } from '../../src/components/Banner';
import { Button, Row } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { Mascot } from '../../src/components/Mascot';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { requestForeground } from '../../src/location/real';
import { haptics, useReduceMotion } from '../../src/motion';
import { useSettings } from '../../src/state/settings';
import wordmark from '../../assets/wordmark-red.png';
import { sys } from '../../src/theme';

type Step = 'welcome' | 'interests' | 'location';
const ORDER: Step[] = ['welcome', 'interests', 'location'];
const LANGUAGE_NAMES: Record<UiLanguage, string> = { de: 'Deutsch', en: 'English' };

/**
 * Onboarding in three steps (spec 11, shortened per UX audit D49): welcome (language from the device, switchable;
 * terms/privacy links), interests (skippable), location with the reason and a one-line traffic safety note. The
 * account stays optional (settings); everyone starts anonymously.
 */
export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const reduceMotion = useReduceMotion();
  const { language, interests, set } = useSettings();
  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const idx = ORDER.indexOf(step);
  const slide = useRef(new Animated.Value(0)).current;
  const dir = useRef(1);

  const go = (to: Step) => {
    dir.current = ORDER.indexOf(to) >= idx ? 1 : -1;
    setStep(to);
  };
  const next = () => go(ORDER[Math.min(ORDER.length - 1, idx + 1)]!);
  const back = () => idx > 0 && go(ORDER[idx - 1]!);

  // steps glide in from the side they come from
  useEffect(() => {
    if (reduceMotion) return slide.setValue(0);
    slide.setValue(dir.current);
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
  }, [step, slide, reduceMotion]);

  // Android back goes one step back instead of leaving the app
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (idx === 0) return false;
      back();
      return true;
    });
    return () => sub.remove();
  });

  const finish = async (askLocation: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      if (askLocation) await requestForeground();
      await backend.auth.ensureSignedIn();
      haptics.success();
      set({ onboarded: true });
      router.replace('/home');
    } catch (e) {
      setError(e instanceof BackendError && e.code === 'network' ? t('errors.network') : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }}
      >
        {idx > 0 ? (
          <Button variant="ghost" size="regular" label={t('common.back')} onPress={back} />
        ) : (
          <View />
        )}
        <Row gap={6}>
          {ORDER.map((s, i) => (
            <View
              key={s}
              style={{
                width: i === idx ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === idx ? sys.accent : sys.fill,
              }}
            />
          ))}
        </Row>
      </View>

      <Animated.View
        style={{
          flex: 1,
          opacity: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateX: slide.interpolate({ inputRange: [-1, 1], outputRange: [-48, 48] }) }],
        }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20, paddingVertical: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {step === 'welcome' && (
            <View style={{ alignItems: 'center', gap: 22 }}>
              <Mascot pose="wave" size={148} />
              <Image
                accessibilityLabel="tuur"
                source={wordmark}
                style={{ width: 180, height: 64 }}
                resizeMode="contain"
              />
              <Text variant="title" align="center">
                {t('onboarding.welcomeTitle')}
              </Text>
              <Text variant="body" color={sys.labelSecondary} align="center">
                {t('onboarding.tuuHello')}
              </Text>
              <Row gap={8}>
                {SUPPORTED_UI_LANGUAGES.map((l) => (
                  <Chip
                    key={l}
                    label={LANGUAGE_NAMES[l]}
                    selected={language === l}
                    onPress={() => set({ language: l })}
                  />
                ))}
              </Row>
            </View>
          )}

          {step === 'interests' && (
            <View style={{ gap: 16 }}>
              <Text variant="title">{t('onboarding.interestsTitle')}</Text>
              <Text variant="body" color={sys.labelSecondary}>
                {t('onboarding.interestsHint')}
              </Text>
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

          {step === 'location' && (
            <View style={{ gap: 16 }}>
              <Mascot pose="point" size={96} />
              <Text variant="title">{t('onboarding.permissionsTitle')}</Text>
              <Text variant="body">{t('onboarding.permissionsBody')}</Text>
              <Banner text={t('onboarding.permissionsBackground')} />
              <Banner tone="warning" icon="alert-triangle" text={t('onboarding.safetyBody')} />
              {error ? <Banner tone="error" text={error} /> : null}
            </View>
          )}
        </ScrollView>
      </Animated.View>

      <View style={{ gap: 10, paddingBottom: 16 }}>
        {step === 'welcome' ? (
          <>
            <Button label={t('onboarding.start')} icon="arrow-right" onPress={next} />
            <Text variant="footnote" align="center">
              {t('onboarding.legalConsent')}
            </Text>
            <Row gap={4} style={{ justifyContent: 'center' }}>
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
          </>
        ) : step === 'interests' ? (
          <>
            <Button label={t('common.continue')} onPress={next} />
            <Button variant="ghost" label={t('common.skip')} onPress={next} />
          </>
        ) : (
          <>
            <Button label={t('onboarding.allowLocation')} loading={busy} onPress={() => void finish(true)} />
            <Button variant="ghost" label={t('onboarding.notNow')} onPress={() => void finish(false)} />
          </>
        )}
      </View>
    </Screen>
  );
}

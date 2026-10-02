import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { INTERESTS, SUPPORTED_UI_LANGUAGES, type Interest, type UiLanguage } from '@tuur/shared';
import { BackendError, useBackend } from '../../src/backend';
import { Banner } from '../../src/components/Banner';
import { Wordmark } from '../../src/components/Brand';
import { Button, Row } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { IntroArt, type IntroKind } from '../../src/components/IntroArt';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { Text } from '../../src/components/Text';
import { TuuSays } from '../../src/components/TuuSays';
import { requestForeground } from '../../src/location/real';
import { haptics, useReduceMotion } from '../../src/motion';
import { useSettings } from '../../src/state/settings';
import { sys } from '../../src/theme';

type Step = 'intro1' | 'intro2' | 'intro3' | 'interests' | 'location';
const ORDER: Step[] = ['intro1', 'intro2', 'intro3', 'interests', 'location'];
const INTRO: Record<'intro1' | 'intro2' | 'intro3', { kind: IntroKind; n: 1 | 2 | 3 }> = {
  intro1: { kind: 'walk', n: 1 },
  intro2: { kind: 'story', n: 2 },
  intro3: { kind: 'choose', n: 3 },
};
const LANGUAGE_NAMES: Record<UiLanguage, string> = { de: 'Deutsch', en: 'English' };

/**
 * Onboarding that shows instead of tells: three illustrated pages (walk and listen, tap a place, choose how), then
 * interests (skippable) and the location request with its reason. The intro can be skipped at any time; the
 * account stays optional, everyone starts anonymously. Terms and privacy are one tap away on the last intro page.
 */
export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const reduceMotion = useReduceMotion();
  const { language, interests, set } = useSettings();
  const [step, setStep] = useState<Step>('intro1');
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

  // pages glide in from the side they come from
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

  const intro = step === 'intro1' || step === 'intro2' || step === 'intro3' ? INTRO[step] : undefined;

  return (
    <Screen>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }}
      >
        {idx > 0 ? (
          <Button variant="ghost" size="regular" label={t('common.back')} onPress={back} />
        ) : (
          <Wordmark width={72} />
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
        {intro ? (
          <Button
            variant="ghost"
            size="regular"
            label={t('onboarding.skipIntro')}
            onPress={() => void finish(false)}
          />
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      <Animated.View
        style={{
          flex: 1,
          opacity: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateX: slide.interpolate({ inputRange: [-1, 1], outputRange: [-48, 48] }) }],
        }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20, paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {intro ? (
            <>
              <IntroArt kind={intro.kind} />
              <View
                accessible
                accessibilityLabel={t('onboarding.pageOf', { index: intro.n, total: 3 })}
                style={{ gap: 8, paddingHorizontal: 4 }}
              >
                <Text variant="title1" accessibilityRole="header">
                  {t(`onboarding.slide${intro.n}Title`)}
                </Text>
                <Text variant="body" color={sys.labelSecondary}>
                  {t(`onboarding.slide${intro.n}Body`)}
                </Text>
              </View>
              {intro.n === 1 ? (
                <View style={{ alignSelf: 'stretch' }}>
                  <Segmented
                    label={t('settings.language')}
                    segments={SUPPORTED_UI_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
                    value={language}
                    onChange={(l) => set({ language: l })}
                  />
                </View>
              ) : null}
            </>
          ) : null}

          {step === 'interests' ? (
            <View style={{ gap: 16 }}>
              <TuuSays pose="idle" text={t('onboarding.interestsHint')} />
              <Text variant="title1" accessibilityRole="header">
                {t('onboarding.interestsTitle')}
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
          ) : null}

          {step === 'location' ? (
            <View style={{ gap: 16 }}>
              <TuuSays pose="point" text={t('onboarding.permissionsBody')} />
              <Text variant="title1" accessibilityRole="header">
                {t('onboarding.permissionsTitle')}
              </Text>
              <Banner text={t('onboarding.permissionsBackground')} />
              <Banner tone="warning" icon="alert-triangle" text={t('onboarding.safetyBody')} />
              {error ? <Banner tone="error" text={error} /> : null}
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      <View style={{ gap: 10, paddingBottom: 16 }}>
        {intro ? (
          <>
            <Button
              label={intro.n === 3 ? t('onboarding.letsGo') : t('common.continue')}
              icon="arrow-right"
              onPress={next}
            />
            <Text variant="footnote" align="center">
              {t('onboarding.consentPre')}
              <Text
                variant="footnote"
                accessibilityRole="link"
                color={sys.accentText}
                style={{ fontWeight: '600' }}
                onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
              >
                {t('onboarding.legalTerms')}
              </Text>
              {t('onboarding.consentAnd')}
              <Text
                variant="footnote"
                accessibilityRole="link"
                color={sys.accentText}
                style={{ fontWeight: '600' }}
                onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
              >
                {t('onboarding.legalPrivacy')}
              </Text>
              {t('onboarding.consentPost')}
            </Text>
          </>
        ) : step === 'interests' ? (
          <>
            <Button label={t('common.continue')} onPress={next} />
            <Button variant="ghost" label={t('common.skip')} onPress={next} />
          </>
        ) : (
          <>
            <Button label={t('common.continue')} loading={busy} onPress={() => void finish(true)} />
          </>
        )}
      </View>
    </Screen>
  );
}

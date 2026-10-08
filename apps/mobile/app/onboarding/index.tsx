import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
  type ColorValue,
  type ScrollView,
} from 'react-native';
import Animated, {
  cubicBezier,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackendError, useBackend } from '../../src/backend';
import { Banner } from '../../src/components/Banner';
import { Wordmark } from '../../src/components/Brand';
import { Icon } from '../../src/components/Icon';
import { IntroArt } from '../../src/components/IntroArt';
import { OnboardingInterests, OnboardingLocation } from '../../src/components/onboarding-setup-art';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { requestForeground } from '../../src/location/real';
import { haptics, useReduceMotion } from '../../src/motion';
import { useSettings } from '../../src/state/settings';
import { spacing, sys } from '../../src/theme';

const STEPS = [
  { icon: 'walk', label: 'onboarding.slide1Title', description: 'onboarding.slide1Body' },
  { icon: 'headphones', label: 'onboarding.slide2Title', description: 'onboarding.slide2Body' },
  { icon: 'git-branch', label: 'onboarding.slide3Title', description: 'onboarding.slide3Body' },
  { icon: 'heart', label: 'onboarding.interestsTitle', description: 'onboarding.interestsHint' },
  { icon: 'navigation', label: 'onboarding.permissionsTitle', description: 'onboarding.permissionsBody' },
] as const;
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

/** A short illustrated introduction, with one clear action and explanation per page. */
export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const reduceMotion = useReduceMotion();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = (windowHeight - insets.top - insets.bottom) / fontScale < 680;
  const language = useSettings((s) => s.language);
  const set = useSettings((s) => s.set);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [pageWidth, setPageWidth] = useState(windowWidth);
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);
  const [error, setError] = useState<string>();
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const pager = useRef<ScrollView>(null);
  const offset = useSharedValue(0);
  const background = sys.background;
  const ink = sys.label;
  const subtle = sys.fill;
  const active = foreground && focused;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    pager.current?.scrollTo({ x: indexRef.current * pageWidth, animated: false });
    offset.set(indexRef.current * pageWidth);
  }, [pageWidth, offset]);

  const selectPage = useCallback((next: number) => {
    const bounded = Math.max(0, Math.min(STEPS.length - 1, next));
    if (bounded === indexRef.current) return;
    indexRef.current = bounded;
    setIndex(bounded);
    haptics.select();
  }, []);

  const go = useCallback(
    (next: number) => {
      if (finishing.current) return;
      const bounded = Math.max(0, Math.min(STEPS.length - 1, next));
      selectPage(bounded);
      pager.current?.scrollTo({ x: bounded * pageWidth, animated: !reduceMotion });
    },
    [pageWidth, reduceMotion, selectPage],
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    offset.set(event.contentOffset.x);
  });

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (finishing.current) return true;
      if (indexRef.current === 0) return false;
      go(indexRef.current - 1);
      return true;
    });
    return () => sub.remove();
  }, [go]);

  const finish = async (askLocation: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (askLocation) await requestForeground();
      await backend.auth.ensureSignedIn();
      haptics.success();
      set({ onboarded: true });
      router.replace('/');
    } catch (e) {
      setError(e instanceof BackendError && e.code === 'network' ? t('errors.network') : t('errors.generic'));
    } finally {
      finishing.current = false;
      setBusy(false);
    }
  };

  return (
    <Screen padded={false} style={{ backgroundColor: background }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: compact ? 0 : 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Wordmark width={80} />
          <View style={{ flex: 1 }} />
          <Action
            label={t('settings.language') + ': ' + (language === 'de' ? 'Deutsch' : 'English')}
            title={language.toUpperCase()}
            icon="globe"
            tint={ink}
            disabled={busy}
            onPress={() => {
              haptics.select();
              set({ language: language === 'de' ? 'en' : 'de' });
            }}
          />
          <Action
            label={t('onboarding.skipIntro')}
            title={t('onboarding.skipIntro')}
            tint={ink}
            disabled={busy}
            onPress={() => void finish(false)}
          />
        </View>
        <View
          style={{ flex: 1, minHeight: 0 }}
          onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}
        >
          <Animated.ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            bounces={false}
            directionalLockEnabled
            alwaysBounceVertical={false}
            contentInsetAdjustmentBehavior="never"
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!busy}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onMomentumScrollEnd={(event) =>
              selectPage(Math.round(event.nativeEvent.contentOffset.x / pageWidth))
            }
            style={{ flex: 1 }}
            testID="onboarding-pager"
          >
            {STEPS.map((step, i) => (
              <StoryPage
                key={step.icon}
                width={pageWidth}
                index={i}
                offset={offset}
                selected={index === i}
                reduceMotion={reduceMotion}
              >
                <View
                  style={{
                    alignSelf: 'center',
                    width: '100%',
                    maxWidth: 520,
                    paddingHorizontal: spacing.lg,
                    paddingTop: compact ? spacing.xs : spacing.md,
                    gap: compact ? spacing.xs : spacing.sm,
                  }}
                >
                  <Text accessibilityRole="header" variant={compact ? 'title2' : 'title1'} align="center">
                    {t(step.label)}
                  </Text>
                  <Text variant={compact ? 'callout' : 'body'} color={sys.labelSecondary} align="center">
                    {t(step.description)}
                  </Text>
                </View>
                <View style={{ flex: 1, minHeight: 0 }}>
                  {i < 3 ? (
                    <IntroArt
                      kind={i === 0 ? 'walk' : i === 1 ? 'story' : 'choose'}
                      active={active && index === i}
                    />
                  ) : i === 3 ? (
                    <OnboardingInterests active={active && index === i} />
                  ) : (
                    <OnboardingLocation active={active && index === i} />
                  )}
                </View>
              </StoryPage>
            ))}
          </Animated.ScrollView>
        </View>
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingBottom: compact ? 0 : 8,
            gap: compact ? 2 : 6,
            alignSelf: 'center',
            width: '100%',
            maxWidth: 520,
          }}
        >
          {error ? (
            <View accessibilityLiveRegion="assertive">
              <Banner tone="error" text={error} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Text
              variant="caption"
              accessibilityLabel={t('onboarding.pageOf', { index: index + 1, total: STEPS.length })}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {index + 1} / {STEPS.length}
            </Text>
            <View style={{ flexDirection: 'row' }}>
              {STEPS.map((step, i) => (
                <Pressable
                  key={step.icon}
                  accessibilityRole="button"
                  accessibilityLabel={
                    t('onboarding.pageOf', { index: i + 1, total: STEPS.length }) + ': ' + t(step.label)
                  }
                  accessibilityState={{ selected: index === i, disabled: busy }}
                  disabled={busy}
                  onPress={() => go(i)}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <View
                    style={{
                      width: index === i ? 22 : 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: index === i ? sys.accent : sys.separator,
                    }}
                  />
                </Pressable>
              ))}
            </View>
          </View>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <Action
              icon="arrow-left"
              label={t('common.back')}
              tint={ink}
              background={subtle}
              disabled={busy || index === 0}
              onPress={() => go(indexRef.current - 1)}
            />
            <Action
              icon={index === 4 ? 'navigation' : 'arrow-right'}
              label={index === 4 ? t('onboarding.allowLocation') : t('common.continue')}
              title={index === 4 ? t('onboarding.allowLocation') : t('common.continue')}
              tint={sys.onAccent}
              background={sys.accent}
              prominent
              loading={busy}
              onPress={() => (index === 4 ? void finish(true) : go(indexRef.current + 1))}
            />
          </View>
          {index === 4 ? (
            <View style={{ alignItems: 'center' }}>
              <Action
                title={t('onboarding.notNow')}
                label={t('onboarding.notNow')}
                tint={ink}
                disabled={busy}
                onPress={() => void finish(false)}
              />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable
              accessibilityRole="link"
              disabled={busy}
              onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
              style={{ flex: 0.5, minWidth: 44, minHeight: 44, justifyContent: 'center' }}
            >
              <Text variant="caption" color={sys.labelSecondary} align="center">
                {t('onboarding.legalTerms')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              disabled={busy}
              onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
              style={{ flex: 1.8, minHeight: 44, justifyContent: 'center' }}
            >
              <Text variant="caption" color={sys.labelSecondary} align="center">
                {t('onboarding.legalPrivacy')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              disabled={busy}
              onPress={() => router.push('/account/delete')}
              style={{ flex: 1.2, minHeight: 44, justifyContent: 'center' }}
            >
              <Text variant="caption" color={sys.labelSecondary} align="center">
                {t('account.delete')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function StoryPage({
  width,
  index,
  offset,
  selected,
  reduceMotion,
  children,
}: {
  width: number;
  index: number;
  offset: SharedValue<number>;
  selected: boolean;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const distance = Math.min(1, Math.abs(offset.get() / width - index));
    return { opacity: 1 - distance * 0.35, transform: [{ scale: reduceMotion ? 1 : 1 - distance * 0.035 }] };
  });
  return (
    <View
      style={{ width, height: '100%' }}
      accessibilityElementsHidden={!selected}
      importantForAccessibility={selected ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>
    </View>
  );
}

function Action({
  icon,
  label,
  title,
  tint = sys.label,
  background = 'transparent',
  prominent,
  loading,
  disabled,
  onPress,
}: {
  icon?: string;
  label: string;
  title?: string;
  tint?: ColorValue;
  background?: ColorValue;
  prominent?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReduceMotion();
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
      style={{ flexShrink: 1, flex: prominent ? 1 : undefined }}
    >
      <Animated.View
        style={{
          minWidth: 48,
          minHeight: prominent ? 50 : 48,
          paddingHorizontal: title ? 16 : 12,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 999,
          backgroundColor: background,
          opacity: disabled ? 0.25 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed && !reduceMotion ? 0.97 : 1 }],
          transitionProperty: ['transform', 'opacity'],
          transitionDuration: 120,
          transitionTimingFunction: EASE_OUT,
        }}
      >
        {loading ? (
          <ActivityIndicator color={tint} />
        ) : icon ? (
          <Icon name={icon} size={prominent ? 27 : 19} color={tint} />
        ) : null}
        {title ? (
          <Text
            variant={prominent ? 'headline' : 'caption'}
            color={tint}
            align="center"
            style={{ flexShrink: 1, fontWeight: '600' }}
          >
            {title}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

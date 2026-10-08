import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, { type CSSAnimationKeyframes } from 'react-native-reanimated';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/session';
import { getAds, subscribed, useEntitlementStore } from '../billing/entitlements';
import {
  cancelFreeTourIntro,
  FREE_TOUR_INTRO_SKIP_DELAY_MS,
  freeTourIntroCountdown,
  useFreeTourIntro,
} from '../ads/freeTourIntro';
import { recordInterstitialShown } from '../ads/interstitialFrequency';
import { getActiveSession } from '../guide/session';
import { useVoicePreview } from '../audio/useVoicePreview';
import { useReduceMotion } from '../motion';
import { TuuPromo } from './tuu-promo';
import { Wordmark } from './Brand';
import { Row } from './Button';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useVoicePromoPalette } from './voice-promo-theme';

const skipFill = { from: { width: '0%' }, to: { width: '100%' } } satisfies CSSAnimationKeyframes<ViewStyle>;

/** Uses bundled audio only; the route does not begin until the introduction and ad have finished. */
export function FreeTourIntroHost() {
  const request = useFreeTourIntro((s) => s.request);
  const path = usePathname();
  const auth = useAuth();
  useEffect(() => () => cancelFreeTourIntro(), [path]);
  useEffect(() => {
    if (auth.step !== 'ready') cancelFreeTourIntro();
  }, [auth.step]);
  return request ? <FreeTourIntro key={request.id} request={request} /> : null;
}

function FreeTourIntro({
  request,
}: {
  request: NonNullable<ReturnType<typeof useFreeTourIntro.getState>['request']>;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const palette = useVoicePromoPalette(true);
  const reduced = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [stage, setStage] = useState<'intro' | 'advertisement' | 'purchase'>('intro');
  const [shownAt, setShownAt] = useState<number | null>(null);
  const preview = useVoicePreview({ active: stage === 'intro', autoPlay: true, lang: request.lang });
  const controller = useRef(new AbortController());
  const advancing = useRef(false);
  const onClosed = useRef<(() => void) | undefined>(undefined);
  const closeIntro = useCallback((nextStage: 'advertisement' | 'purchase') => {
    return new Promise<void>((resolve) => {
      onClosed.current = resolve;
      setStage(nextStage);
    });
  }, []);
  useEffect(() => {
    // iOS supplies onDismiss after its presentation controller has finished closing.
    if (stage === 'intro' || Platform.OS === 'ios') return;
    const timer = setTimeout(() => onClosed.current?.(), 350);
    return () => clearTimeout(timer);
  }, [stage]);
  const requestAd = useCallback(async () => {
    if (advancing.current || !freeTourIntroCountdown(shownAt, Date.now()).unlocked) return;
    advancing.current = true;
    const signal = controller.current.signal;
    try {
      // UMP/Google must not present over an intro that is still dismissing.
      await closeIntro('advertisement');
      if (signal.aborted) return;
      if (!subscribed(useEntitlementStore.getState())) {
        const ads = getAds();
        await ads.gatherConsent();
        if (signal.aborted) return;
        if (await ads.showInterstitial({ waitForReadyMs: 8_000, signal })) await recordInterstitialShown();
      }
    } catch {
      // Unavailable ads or consent services must not lock the free text tier.
    }
    if (!signal.aborted) request.resolve(true);
  }, [closeIntro, request, shownAt]);
  useEffect(() => {
    const abort = controller.current;
    const off = AppState.addEventListener('change', (state) => {
      // Native consent/ad controllers may temporarily make iOS inactive, but backgrounding cancels a start.
      if (state === 'background') {
        abort.abort();
        request.resolve(false);
      }
    });
    return () => {
      abort.abort();
      onClosed.current?.();
      off.remove();
    };
  }, [request]);
  const cancel = () => {
    controller.current.abort();
    request.resolve(false);
  };
  const openPurchase = async () => {
    if (advancing.current) return;
    advancing.current = true;
    await closeIntro('purchase');
    if (controller.current.signal.aborted) return;
    getActiveSession()?.runtime.pause();
    request.resolve(false);
    router.push({ pathname: '/paywall', params: { intent: 'pricing' } });
  };
  return (
    <Modal
      visible={stage === 'intro'}
      presentationStyle="fullScreen"
      animationType={reduced ? 'none' : 'fade'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={cancel}
      onShow={() => setShownAt((previous) => previous ?? Date.now())}
      onDismiss={() => onClosed.current?.()}
    >
      <View
        testID="free-tour-intro-screen"
        style={{
          flex: 1,
          backgroundColor: palette.background,
          paddingHorizontal: width < 380 ? 20 : 24,
          paddingTop: insets.top + 8,
          paddingBottom: Math.max(16, insets.bottom + 8),
        }}
      >
        <View style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: 460, alignSelf: 'center', gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Wordmark width={80} />
            <PressableScale
              scaleTo={0.92}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              onPress={cancel}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.surface,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon name="x" size={20} color={palette.ink} />
            </PressableScale>
          </Row>
          <View style={{ flex: 1, minHeight: 0, justifyContent: 'center' }}>
            <TuuPromo preview={preview} active={stage === 'intro'} fitScreen neutral />
          </View>
          <View style={{ gap: 8, flexShrink: 0 }}>
            <PromoAction label={t('freeTourIntro.buy')} onPress={() => void openPurchase()} primary />
            <SkipAction startedAt={shownAt} active={stage === 'intro'} onPress={() => void requestAd()} />
          </View>
          <View style={{ gap: 4, flexShrink: 0 }}>
            <Text
              variant="caption"
              color={palette.muted}
              align="center"
              style={{ fontSize: 11, lineHeight: 16 }}
            >
              {t('freeTourIntro.adHint')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PromoAction({
  label,
  onPress,
  primary = false,
  disabled = false,
  progress,
  animateProgress = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  progress?: number;
  animateProgress?: boolean;
}) {
  const palette = useVoicePromoPalette(true);
  const color = primary ? '#FFFFFF' : disabled ? palette.disabled : palette.ink;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityValue={
        progress === undefined ? undefined : { min: 0, max: 100, now: Math.round(progress * 100) }
      }
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderRadius: 15,
        borderCurve: 'continuous',
        borderWidth: primary ? 0 : 1,
        borderColor: palette.border,
        backgroundColor: primary ? palette.accent : palette.surface,
        overflow: 'hidden',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {progress !== undefined ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress * 100}%`,
            backgroundColor: palette.track,
            animationName: animateProgress ? skipFill : undefined,
            animationDuration: FREE_TOUR_INTRO_SKIP_DELAY_MS,
            animationTimingFunction: 'linear',
            animationFillMode: 'forwards',
          }}
        />
      ) : null}
      {!primary && disabled ? <Icon name="lock" size={14} color={color} /> : null}
      <Text
        color={color}
        align="center"
        style={{ flexShrink: 1, fontSize: primary ? 15 : 13, lineHeight: 20, fontWeight: '700' }}
      >
        {label}
      </Text>
      {primary ? <Icon name="arrow-right" size={18} color={color} /> : null}
    </PressableScale>
  );
}

function SkipAction({
  startedAt,
  active,
  onPress,
}: {
  startedAt: number | null;
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const reduced = useReduceMotion();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (startedAt === null || !active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      const remaining = FREE_TOUR_INTRO_SKIP_DELAY_MS - (time - startedAt);
      if (remaining > 0) timer = setTimeout(tick, Math.min(1000, remaining));
    };
    tick();
    return () => clearTimeout(timer);
  }, [active, startedAt]);
  const countdown = freeTourIntroCountdown(startedAt, now);
  return (
    <PromoAction
      label={
        countdown.unlocked
          ? t('freeTourIntro.continue')
          : t('freeTourIntro.countdown', { count: countdown.remainingSeconds })
      }
      disabled={!active || !countdown.unlocked}
      progress={countdown.progress}
      animateProgress={startedAt !== null && active && !reduced}
      onPress={onPress}
    />
  );
}

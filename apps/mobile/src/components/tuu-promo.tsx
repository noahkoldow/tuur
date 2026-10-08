import { useId, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, { cubicBezier, FadeIn, type CSSAnimationKeyframes } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { DEFAULT_VOICE_CAST } from '@tuur/shared';
import type { useVoicePreview } from '../audio/useVoicePreview';
import { previewVoice } from '../audio/voice-previews';
import { useReduceMotion } from '../motion';
import { Icon } from './Icon';
import { voiceMascots } from './voice-mascots';
import { useVoicePromoPalette } from './voice-promo-theme';
import { Text } from './Text';

const ease = cubicBezier(0.77, 0, 0.175, 1);
const float = {
  '0%, 100%': { transform: [{ translateY: 0 }, { rotate: '-2deg' }] },
  '50%': { transform: [{ translateY: -6 }, { rotate: '2deg' }] },
} satisfies CSSAnimationKeyframes<ViewStyle>;
const sound = {
  '0%, 100%': { transform: [{ scaleY: 0.45 }] },
  '45%': { transform: [{ scaleY: 1 }] },
} satisfies CSSAnimationKeyframes<ViewStyle>;

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Native rendering of the /voices preview; scenes stay tied to the actual audio. */
export function TuuPromo({
  preview,
  active = true,
  compact = false,
  gated = false,
  fitScreen = false,
  neutral = false,
}: {
  preview: ReturnType<typeof useVoicePreview>;
  active?: boolean;
  compact?: boolean;
  gated?: boolean;
  /** Keeps controls visible while the illustration flexes into the remaining screen height. */
  fitScreen?: boolean;
  neutral?: boolean;
}) {
  const { t } = useTranslation();
  const reduced = useReduceMotion();
  const p = useVoicePromoPalette(neutral);
  const haloId = `voice-halo-${useId().replace(/:/g, '')}`;
  const { height, width, fontScale } = useWindowDimensions();
  const [availableHeight, setAvailableHeight] = useState<number | undefined>();
  // With large system text, reserve space for controls by removing optional scene titles/labels.
  const condensed = fitScreen && availableHeight !== undefined && availableHeight < 220 * fontScale;
  const { status, progress, playing } = preview;
  const scene = progress < 0.18 ? 0 : progress < 0.53 ? 1 : 2;
  const moving = active && playing && !reduced;
  const artHeight = compact ? 208 : Math.max(208, Math.min(288, height * 0.32, width - 48));
  const remaining = Math.max(0, Math.ceil(status.duration - status.position));
  const playLabel = t(
    playing
      ? 'player.pause'
      : status.phase === 'ended'
        ? 'tuuPromo.replay'
        : status.phase === 'paused'
          ? 'tuuPromo.resume'
          : 'tuuPromo.start',
  );
  const progressLabel =
    status.phase === 'error'
      ? t(gated ? 'tuuPromo.failed' : 'voicePreview.failed')
      : status.phase === 'loading'
        ? t('tuuPromo.loading')
        : gated && preview.continueUnlocked
          ? t('tuuPromo.ready')
          : gated && remaining > 0
            ? t('tuuPromo.remaining', { count: remaining })
            : t(
                status.phase === 'ended'
                  ? 'tuuPromo.done'
                  : playing
                    ? 'tuuPromo.playing'
                    : status.phase === 'paused'
                      ? 'tuuPromo.paused'
                      : 'tuuPromo.idle',
              );

  return (
    <View
      testID="tuu-promo"
      onLayout={fitScreen ? (event) => setAvailableHeight(event.nativeEvent.layout.height) : undefined}
      style={{
        width: '100%',
        maxWidth: 460,
        alignSelf: 'center',
        ...(fitScreen ? { flex: 1, minHeight: 0, maxHeight: 640 } : {}),
      }}
    >
      <View
        style={{
          display: condensed ? 'none' : 'flex',
          alignItems: 'center',
          gap: fitScreen ? 0 : 9,
          paddingTop: fitScreen ? 0 : compact ? 4 : 10,
        }}
      >
        {!fitScreen ? (
          <Text
            variant="caption"
            color={p.subtle}
            align="center"
            style={{
              fontSize: 10,
              lineHeight: 15,
              fontWeight: '700',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            {t('tuuPromo.eyebrow')}
          </Text>
        ) : null}
        <Text
          variant="title1"
          color={p.ink}
          align="center"
          accessibilityRole="header"
          numberOfLines={fitScreen ? 2 : undefined}
          adjustsFontSizeToFit={fitScreen}
          style={{
            maxWidth: 340,
            minHeight: fitScreen ? undefined : compact ? 60 : 68,
            fontSize: fitScreen || compact ? 26 : 29,
            lineHeight: fitScreen ? 30 : 34,
            fontWeight: '800',
            letterSpacing: -1,
          }}
        >
          {t(`tuuPromo.scene${scene}`)}
        </Text>
      </View>
      <View
        style={{
          ...(fitScreen ? ({ flex: 1, minHeight: 0, overflow: 'hidden' } as const) : { height: artHeight }),
          width: '100%',
          maxWidth: 400,
          alignSelf: 'center',
          alignItems: 'center',
        }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t(`tuuPromo.art${scene}`)}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%" viewBox="0 0 360 280" preserveAspectRatio="xMidYMid meet">
            <Defs>
              <RadialGradient id={haloId} cx="50%" cy="48%" r="50%">
                <Stop offset="0" stopColor={scene === 1 ? p.park : p.halo} />
                <Stop offset="0.55" stopColor={scene === 1 ? p.parkSoft : p.haloSoft} />
                <Stop offset="1" stopColor={p.background} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Ellipse cx={180} cy={140} rx={172} ry={136} fill={`url(#${haloId})`} />
            {scene === 1 ? (
              <>
                <Path
                  d="M18 158C54 104 110 216 156 179S209 53 283 90s68 78 39 91"
                  stroke={p.route}
                  strokeWidth={2}
                  strokeDasharray="5 8"
                  fill="none"
                  opacity={0.65}
                />
                <Circle cx={19} cy={156} r={5} fill={p.accent} />
                <Circle cx={320} cy={181} r={5} fill={p.accent} />
              </>
            ) : null}
            <Ellipse cx={180} cy={262} rx={83} ry={12} fill={p.ground} opacity={0.12} />
            <Ellipse cx={180} cy={262} rx={68} ry={7} fill={p.ground} opacity={0.16} />
            <Path
              d="m43 42 3 8 8 3-8 3-3 8-3-8-8-3 8-3m276 51 2 5 5 2-5 2-2 5-2-5-5-2 5-2m-40-65 1 3 3 1-3 1-1 3-1-3-3-1 3-1"
              fill={p.route}
              opacity={0.7}
            />
          </Svg>
        </View>
        <Animated.View
          key={`${preview.voice}:${scene}`}
          pointerEvents="none"
          entering={reduced ? undefined : FadeIn.duration(180)}
          style={{
            width: '100%',
            maxWidth: 290,
            height: '100%',
            animationName: reduced ? undefined : float,
            animationDuration: '2800ms',
            animationIterationCount: 'infinite',
            animationTimingFunction: ease,
            animationPlayState: moving ? 'running' : 'paused',
          }}
        >
          <Image
            source={voiceMascots[preview.voice][scene]}
            contentFit="contain"
            style={{ width: '100%', height: '100%' }}
            accessible={false}
          />
        </Animated.View>
        <View
          pointerEvents="none"
          style={[
            styles.pill,
            { backgroundColor: p.surface, borderColor: p.border },
            scene === 1
              ? { right: 0, top: '27%', maxWidth: '58%', transform: [{ rotate: '5deg' }] }
              : { left: '1%', top: scene === 0 ? '32%' : '42%', transform: [{ rotate: '-5deg' }] },
          ]}
        >
          {scene === 0 ? (
            <Text color={p.ink} allowFontScaling={false} style={{ fontWeight: '700', fontSize: 16 }}>
              Hi!
            </Text>
          ) : scene === 1 ? (
            <>
              <Icon name="map-pin" size={17} color={p.accent} />
              <Text
                color={p.ink}
                allowFontScaling={false}
                style={{ fontSize: 12, fontWeight: '700', flexShrink: 1 }}
              >
                {t('tuuPromo.places')}
              </Text>
            </>
          ) : (
            <View style={{ height: 24, flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              {[8, 17, 24, 17, 8].map((barHeight, index) => (
                <Animated.View
                  key={index}
                  style={{
                    width: 3,
                    height: barHeight,
                    borderRadius: 3,
                    backgroundColor: p.accent,
                    animationName: reduced ? undefined : sound,
                    animationDuration: `${700 + index * 90}ms`,
                    animationDelay: `${index * -120}ms`,
                    animationIterationCount: 'infinite',
                    animationTimingFunction: ease,
                    animationPlayState: moving ? 'running' : 'paused',
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </View>
      <View
        accessible={false}
        style={{
          display: condensed ? 'none' : 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          height: 16,
          marginTop: 2,
          marginBottom: fitScreen ? 6 : compact ? 12 : 18,
        }}
      >
        {[0, 1, 2].map((step) => (
          <View
            key={step}
            style={{
              width: scene === step ? 27 : 13,
              height: 4,
              borderRadius: 4,
              backgroundColor: scene === step ? p.accent : p.track,
            }}
          />
        ))}
      </View>
      {!fitScreen ? (
        <Text variant="caption" color={p.muted} align="center" style={{ fontWeight: '600', marginBottom: 9 }}>
          {t('tuuPromo.voices')}
        </Text>
      ) : null}
      <View style={{ flexDirection: !fitScreen && fontScale > 1.5 ? 'column' : 'row', gap: 8 }}>
        {DEFAULT_VOICE_CAST.map((persona) => {
          const selected = preview.voice === persona.id;
          return (
            <Pressable
              key={persona.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !active }}
              accessibilityHint={t('voicePreview.selectVoice')}
              disabled={!active}
              onPress={() => preview.selectVoice(previewVoice(persona.id))}
              style={({ pressed }) => ({
                flex: !fitScreen && fontScale > 1.5 ? undefined : 1,
                minWidth: 0,
                minHeight: 48,
                paddingHorizontal: 6,
                paddingVertical: fitScreen ? 6 : 10,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 6,
                borderRadius: 15,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: selected ? p.accent : p.border,
                backgroundColor: selected ? p.selected : p.surface,
                opacity: !active ? 0.5 : pressed ? 0.75 : 1,
              })}
            >
              {selected ? (
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: p.accent }} />
              ) : null}
              <Text
                variant="subheadline"
                color={selected ? p.accentText : p.muted}
                align="center"
                numberOfLines={fitScreen ? 1 : undefined}
                adjustsFontSizeToFit={fitScreen}
                style={{ flexShrink: 1, fontSize: 14, fontWeight: '600' }}
              >
                {persona.names[preview.language] ?? persona.id}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: fitScreen ? 6 : 16, gap: fitScreen ? 4 : 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            columnGap: 12,
            rowGap: 4,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${playLabel} · ${preview.voiceName}`}
            accessibilityHint={status.phase === 'error' ? t('voicePreview.failed') : undefined}
            accessibilityState={{ disabled: !active || status.phase === 'loading' }}
            disabled={!active || status.phase === 'loading'}
            onPress={playing ? preview.pause : status.phase === 'ended' ? preview.replay : preview.play}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              minHeight: 48,
              flexShrink: 1,
              opacity: !active || status.phase === 'loading' ? 0.5 : pressed ? 0.75 : 1,
            })}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: p.accent,
              }}
            >
              <Icon
                name={playing ? 'pause' : status.phase === 'ended' ? 'rotate-ccw' : 'play'}
                size={17}
                color="#FFFFFF"
              />
            </View>
            {!condensed ? (
              <Text
                variant="caption"
                color={p.ink}
                style={{ flexShrink: 1, fontWeight: '600', fontSize: 13 }}
              >
                {playLabel}
              </Text>
            ) : null}
          </Pressable>
          {condensed && status.phase === 'error' ? (
            <View accessible accessibilityRole="alert" accessibilityLabel={t('voicePreview.failed')}>
              <Icon name="alert-circle" size={22} color={p.accentText} />
            </View>
          ) : null}
          {!fitScreen ? (
            <Text variant="caption" color={p.muted} style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
              {clock(status.position)} / {status.duration > 0 ? clock(status.duration) : '—'}
            </Text>
          ) : null}
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t('tuuPromo.progress')}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={{ height: 4, overflow: 'hidden', borderRadius: 4, backgroundColor: p.track }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              borderRadius: 4,
              width: `${progress * 100}%`,
              backgroundColor: p.accent,
              transitionProperty: 'width',
              transitionDuration: reduced || !playing ? 0 : 180,
              transitionTimingFunction: 'linear',
            }}
          />
        </View>
        {!fitScreen || (status.phase === 'error' && !condensed) ? (
          <Text
            variant="caption"
            color={status.phase === 'error' ? p.accentText : p.muted}
            align="center"
            style={{ minHeight: 17, fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'] }}
          >
            {progressLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
    boxShadow: '0 5px 16px rgba(107,76,28,0.04)',
  },
});

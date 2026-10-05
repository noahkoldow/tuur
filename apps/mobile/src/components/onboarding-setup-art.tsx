import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View, useColorScheme } from 'react-native';
import Animated, {
  cancelAnimation,
  cubicBezier,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { INTERESTS, type Interest } from '@tuur/shared';
import { haptics, useReduceMotion } from '../motion';
import { useSettings } from '../state/settings';
import { BRAND_RED } from '../theme';
import { categoryPalette } from '../theme/categories';
import { Icon } from './Icon';
import { INTEREST_ICON } from './icons';
import { Mascot } from './Mascot';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const CSS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

/** The drawing has a fixed coordinate system; its containing layout remains responsive. */
function useArtSize() {
  const [size, setSize] = useState({ width: 350, height: 500 });
  return {
    ...size,
    onLayout: (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = event.nativeEvent.layout;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    },
  };
}

function InterestTile({
  interest,
  index,
  selected,
  size,
  onPress,
}: {
  interest: Interest;
  index: number;
  selected: boolean;
  size: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const dark = useColorScheme() === 'dark';
  const reduced = useReduceMotion();
  const tone = categoryPalette[interest][dark ? 'dark' : 'light'];
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={t(`interests.${interest}`)}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      pressRetentionOffset={12}
      style={{ width: size, height: size + 6 }}
    >
      {({ pressed }) => (
        <Animated.View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tone.background,
            borderRadius: 23,
            borderCurve: 'continuous',
            borderWidth: 2,
            borderColor: selected ? tone.foreground : 'transparent',
            transform: [
              { rotate: selected || reduced ? '0deg' : `${index % 2 === 0 ? -4 : 4}deg` },
              { scale: pressed && !reduced ? 0.96 : 1 },
            ],
            transitionProperty: ['transform', 'borderColor'],
            transitionDuration: reduced ? 0 : 140,
            transitionTimingFunction: CSS_EASE_OUT,
          }}
        >
          <Icon name={INTEREST_ICON[interest]} size={size * 0.43} color={tone.foreground} />
          <View
            style={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              width: 17,
              height: 17,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? tone.foreground : 'transparent',
              borderWidth: selected ? 0 : 1.5,
              borderColor: tone.foreground,
              opacity: selected ? 1 : 0.4,
            }}
          >
            {selected ? <Icon name="check" size={11} color={tone.background} weight="bold" /> : null}
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** Choose the little things you love; Tuu reacts as they become your guide's interests. */
export function OnboardingInterests({ active = true }: { active?: boolean }) {
  const { t } = useTranslation();
  const dark = useColorScheme() === 'dark';
  const reduced = useReduceMotion();
  const interests = useSettings((state) => state.interests);
  const set = useSettings((state) => state.set);
  const { width, height, onLayout } = useArtSize();
  const float = useSharedValue(0);
  const response = useSharedValue(0);
  const heart = useSharedValue(1);
  const [lastInterest, setLastInterest] = useState<Interest>('hidden_gems');
  const tileSize = Math.max(48, Math.min(76, (width - 62) / 4));
  const artScale = Math.min((width - 32) / 350, Math.max(0.62, (height - tileSize * 2 - 66) / 255), 1.12);
  const tone = categoryPalette[lastInterest][dark ? 'dark' : 'light'];

  useEffect(() => {
    if (!active || reduced) {
      cancelAnimation(float);
      cancelAnimation(response);
      cancelAnimation(heart);
      float.set(0);
      response.set(0);
      heart.set(1);
      return;
    }
    float.set(withRepeat(withTiming(1, { duration: 2100, easing: EASE_IN_OUT }), -1, true));
    return () => {
      cancelAnimation(float);
      cancelAnimation(response);
      cancelAnimation(heart);
    };
  }, [active, reduced, float, response, heart]);

  const mascotMotion = useAnimatedStyle(() => ({
    transform: [{ translateY: -float.get() * 5 - response.get() * 10 }],
  }));
  const heartMotion = useAnimatedStyle(() => ({
    opacity: interpolate(heart.get(), [0, 0.12, 0.7, 1], [0, 1, 1, 0]),
    transform: [{ translateY: 38 - heart.get() * 92 }, { rotate: `${heart.get() * -16}deg` }],
  }));

  const toggle = (interest: Interest) => {
    const selected = interests.includes(interest);
    set({ interests: selected ? interests.filter((item) => item !== interest) : [...interests, interest] });
    haptics.select();
    if (!selected) {
      setLastInterest(interest);
      if (active && !reduced) {
        response.set(
          withSequence(
            withTiming(1, { duration: 140, easing: EASE_OUT }),
            withTiming(0, { duration: 200, easing: EASE_OUT }),
          ),
        );
        heart.set(0);
        heart.set(withTiming(1, { duration: 780, easing: EASE_OUT }));
      }
    }
  };

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 12,
          gap: 22,
        }}
      >
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${t('onboarding.interestsTitle')} ${t('onboarding.interestsHint')}`}
          style={{ width: 350 * artScale, height: 255 * artScale }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: 350, height: 255, transform: [{ scale: artScale }], transformOrigin: 'top left' }}
          >
            <View
              style={{
                position: 'absolute',
                width: 224,
                height: 224,
                borderRadius: 112,
                left: 63,
                top: 15,
                backgroundColor: dark ? '#352923' : '#F9E8D0',
              }}
            />
            <Svg width={350} height={255} style={{ position: 'absolute' }}>
              <Path
                d="M54 170 Q40 103 79 67 M276 53 Q327 113 298 169"
                stroke={dark ? '#645443' : '#E1C8A6'}
                strokeWidth={2}
                strokeDasharray="2 9"
                fill="none"
                strokeLinecap="round"
              />
              <Path
                d="M72 47 V62 M64.5 54.5 H79.5 M286 189 V204 M278.5 196.5 H293.5"
                stroke={dark ? '#F5C56D' : '#D39C45'}
                strokeWidth={3}
                strokeLinecap="round"
              />
              <Circle cx={283} cy={43} r={5} fill={dark ? '#9FDAAE' : '#A4C6A4'} />
              <Circle cx={44} cy={201} r={4} fill={dark ? '#D2ADF8' : '#C0ABDD'} />
            </Svg>
            <Animated.View style={[{ position: 'absolute', left: 57, top: 11 }, mascotMotion]}>
              <Mascot
                pose={interests.length ? 'celebrate' : 'present'}
                size={236}
                idle={false}
                entrance={false}
              />
            </Animated.View>
            <View
              style={{
                position: 'absolute',
                left: 25,
                top: 114,
                width: 49,
                height: 49,
                borderRadius: 18,
                backgroundColor: dark ? '#3D2231' : '#FDEBF4',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ rotate: '-12deg' }],
              }}
            >
              <Icon name="heart" size={24} color={dark ? '#F3AED0' : '#B64073'} />
            </View>
            <View
              style={{
                position: 'absolute',
                right: 22,
                top: 94,
                width: 55,
                height: 55,
                borderRadius: 19,
                backgroundColor: tone.background,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ rotate: '9deg' }],
              }}
            >
              <Icon name={INTEREST_ICON[lastInterest]} size={29} color={tone.foreground} />
            </View>
            <Animated.View style={[{ position: 'absolute', right: 78, top: 73 }, heartMotion]}>
              <Icon name="heart" size={29} color={BRAND_RED} />
            </Animated.View>
          </View>
        </View>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 12,
            width: tileSize * 4 + 36,
          }}
        >
          {INTERESTS.map((interest, index) => (
            <InterestTile
              key={interest}
              interest={interest}
              index={index}
              size={tileSize}
              selected={interests.includes(interest)}
              onPress={() => toggle(interest)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function PlaceMarker({ interest, x, y }: { interest: Interest; x: number; y: number }) {
  const dark = useColorScheme() === 'dark';
  const tone = categoryPalette[interest][dark ? 'dark' : 'light'];
  return (
    <View
      style={{
        position: 'absolute',
        left: x - 24,
        top: y - 24,
        width: 48,
        height: 48,
        borderRadius: 17,
        borderBottomLeftRadius: 5,
        transform: [{ rotate: '-8deg' }],
        backgroundColor: tone.background,
        borderWidth: 2,
        borderColor: dark ? '#292923' : '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: dark ? '0 4px 12px #00000020' : '0 4px 12px #68553814',
      }}
    >
      <Icon name={INTEREST_ICON[interest]} size={25} color={tone.foreground} />
    </View>
  );
}

function LocationRing({ phase, running }: { phase: number; running: boolean }) {
  const pulse = useSharedValue(phase);
  useEffect(() => {
    if (!running) {
      cancelAnimation(pulse);
      pulse.set(phase);
      return;
    }
    pulse.set(withRepeat(withTiming(phase + 1, { duration: 3000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(pulse);
  }, [phase, pulse, running]);
  const motion = useAnimatedStyle(() => {
    const progress = pulse.get() % 1;
    return { opacity: running ? 0.55 * (1 - progress) : 0.26, transform: [{ scale: 0.45 + progress * 1.5 }] };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 128,
          top: 236,
          width: 94,
          height: 94,
          borderRadius: 47,
          borderWidth: 1.5,
          borderColor: '#458CD9',
          backgroundColor: '#458CD908',
        },
        motion,
      ]}
    />
  );
}

/** A nearby place becomes a story in your headphones, with the location dot as the link. */
export function OnboardingLocation({ active = true }: { active?: boolean }) {
  const { t } = useTranslation();
  const dark = useColorScheme() === 'dark';
  const reduced = useReduceMotion();
  const { width, height, onLayout } = useArtSize();
  const scale = Math.max(0.25, Math.min((width - 24) / 350, (height - 12) / 430, 1.2));
  const breath = useSharedValue(0);
  const running = active && !reduced;
  useEffect(() => {
    if (!running) {
      cancelAnimation(breath);
      breath.set(0);
      return;
    }
    breath.set(withRepeat(withTiming(1, { duration: 1800, easing: EASE_IN_OUT }), -1, true));
    return () => cancelAnimation(breath);
  }, [breath, running]);
  const mascotMotion = useAnimatedStyle(() => ({ transform: [{ translateY: -breath.get() * 5 }] }));
  const soundMotion = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.55 + breath.get() * 0.45 }] }));
  const road = dark ? '#34372F' : '#FFFFFF';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={onLayout}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('onboarding.permissionsBody')}
        style={{ width: 350 * scale, height: 430 * scale }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: 350, height: 430, transform: [{ scale }], transformOrigin: 'top left' }}
        >
          <View
            style={{
              position: 'absolute',
              left: 62,
              top: 23,
              width: 225,
              height: 225,
              borderRadius: 113,
              backgroundColor: dark ? '#24312A' : '#E8EEDD',
            }}
          />
          <Svg width={350} height={430} style={{ position: 'absolute' }}>
            <Path
              d="M35 174 Q12 178 17 220 L39 377 Q42 404 69 405 L309 382 Q335 379 329 355 L307 198 Q305 176 279 173 Z"
              fill={dark ? '#262A25' : '#F0EDE3'}
            />
            <Path
              d="M39 261 Q118 232 171 271 T330 321"
              stroke={dark ? '#294856' : '#C3DFE9'}
              strokeWidth={32}
              fill="none"
            />
            <Path
              d="M48 209 L310 353 M75 395 L259 181 M25 306 L314 255"
              stroke={road}
              strokeWidth={13}
              fill="none"
              strokeLinecap="round"
            />
            <Path d="M78 372 L287 206" stroke={road} strokeWidth={9} fill="none" strokeLinecap="round" />
            <Rect
              x={68}
              y={310}
              width={55}
              height={54}
              rx={16}
              fill={dark ? '#334531' : '#D9E6C3'}
              transform="rotate(-8 95 337)"
            />
            <Rect
              x={243}
              y={337}
              width={40}
              height={29}
              rx={9}
              fill={dark ? '#413D30' : '#E3D6BA'}
              transform="rotate(-8 263 351)"
            />
            <Rect
              x={219}
              y={195}
              width={43}
              height={29}
              rx={9}
              fill={dark ? '#413D30' : '#E3D6BA'}
              transform="rotate(-8 240 210)"
            />
            <Path
              d="M175 283 C157 226 108 219 77 220 M175 283 Q217 280 278 297 M175 283 Q193 354 114 364"
              stroke={dark ? '#C3A576' : '#B79F7F'}
              strokeWidth={2.5}
              strokeDasharray="2 8"
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
          <LocationRing phase={0} running={running} />
          <LocationRing phase={0.5} running={running} />
          <PlaceMarker interest="history" x={72} y={214} />
          <PlaceMarker interest="culinary" x={285} y={291} />
          <PlaceMarker interest="nature" x={107} y={359} />
          <View
            style={{
              position: 'absolute',
              left: 164,
              top: 272,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: '#458CD9',
              borderWidth: 4,
              borderColor: '#FFFFFF',
              boxShadow: '0 2px 9px #458CD946',
            }}
          />
          <Animated.View style={[{ position: 'absolute', left: 50, top: 22 }, mascotMotion]}>
            <Mascot pose="map" size={241} idle={false} entrance={false} />
          </Animated.View>
          <View
            style={{
              position: 'absolute',
              right: 16,
              top: 69,
              width: 84,
              height: 94,
              borderRadius: 29,
              borderBottomLeftRadius: 8,
              backgroundColor: dark ? '#342A24' : '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              transform: [{ rotate: '8deg' }],
              boxShadow: '0 6px 20px #6855380C',
            }}
          >
            <Icon name="headphones" size={34} color={BRAND_RED} />
            <Animated.View
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 19 }, soundMotion]}
            >
              {[7, 13, 19, 11, 17, 8].map((bar, index) => (
                <View
                  key={index}
                  style={{ width: 3, height: bar, borderRadius: 2, backgroundColor: BRAND_RED }}
                />
              ))}
            </Animated.View>
          </View>
          <Svg width={350} height={430} style={{ position: 'absolute' }}>
            <Path
              d="M50 106 V120 M43 113 H57 M297 37 V51 M290 44 H304"
              stroke={dark ? '#F5C56D' : '#CEAA65'}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </Svg>
        </View>
      </View>
    </View>
  );
}

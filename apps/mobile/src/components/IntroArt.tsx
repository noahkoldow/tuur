import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import Animated, { cubicBezier, type CSSAnimationKeyframes } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { haptics, useReduceMotion } from '../motion';
import { BRAND_RED } from '../theme';
import { Icon } from './Icon';
import { Mascot } from './Mascot';

export type IntroKind = 'walk' | 'story' | 'choose';

/** SVG and Reanimated need resolved colors, rather than iOS dynamic color objects. */
export const introPalette = (dark: boolean) => ({
  background: dark ? '#191817' : '#F8F5EF',
  paper: dark ? '#302D29' : '#FFFCF6',
  block: dark ? '#252723' : '#EAEADE',
  street: dark ? '#3B3B34' : '#FFFDF8',
  ink: dark ? '#EEE7DB' : '#333B32',
  muted: dark ? '#57564A' : '#D3D2BF',
  park: dark ? '#394A3A' : '#DAE4C6',
  tree: dark ? '#617A59' : '#A9BF8B',
  water: dark ? '#2B4750' : '#D0E5E7',
  stone: dark ? '#B4A48B' : '#D2BD99',
  stoneLight: dark ? '#D4C4AB' : '#ECDCC0',
  stoneShade: dark ? '#847961' : '#B39D7A',
  accent: BRAND_RED,
  accentTint: dark ? '#542A29' : '#F8DFD7',
});
type Palette = ReturnType<typeof introPalette>;

const ease = cubicBezier(0.77, 0, 0.175, 1);
const float = {
  '0%, 100%': { transform: [{ translateY: 0 }, { rotate: '-2deg' }] },
  '50%': { transform: [{ translateY: -9 }, { rotate: '1deg' }] },
} satisfies CSSAnimationKeyframes<ViewStyle>;
const stroll = {
  '0%, 100%': { transform: [{ translateX: -5 }, { translateY: 0 }, { rotate: '-2deg' }] },
  '25%': { transform: [{ translateX: 0 }, { translateY: -7 }, { rotate: '1deg' }] },
  '50%': { transform: [{ translateX: 5 }, { translateY: 0 }, { rotate: '2deg' }] },
  '75%': { transform: [{ translateX: 0 }, { translateY: -7 }, { rotate: '-1deg' }] },
} satisfies CSSAnimationKeyframes<ViewStyle>;
const discover = {
  '0%, 100%': { opacity: 0.55, transform: [{ translateY: 5 }, { scale: 0.94 }] },
  '25%, 70%': { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
} satisfies CSSAnimationKeyframes<ViewStyle>;
const pulse = {
  '0%': { opacity: 0.4, transform: [{ scale: 0.95 }] },
  '85%, 100%': { opacity: 0, transform: [{ scale: 1.35 }] },
} satisfies CSSAnimationKeyframes<ViewStyle>;
const wave = {
  '0%, 100%': { transform: [{ scaleY: 0.35 }] },
  '45%': { transform: [{ scaleY: 1 }] },
  '70%': { transform: [{ scaleY: 0.65 }] },
} satisfies CSSAnimationKeyframes<ViewStyle>;

/** Three wordless scenes, built at one artboard size so landmarks and Tuu stay in proportion. */
export function IntroArt({ kind, active = true }: { kind: IntroKind; active?: boolean }) {
  const dark = useColorScheme() === 'dark';
  const reduced = useReduceMotion();
  const [bounds, setBounds] = useState({ width: 360, height: 440 });
  const p = introPalette(dark);
  const scale = Math.max(0.1, Math.min(bounds.width / 360, bounds.height / 440, 1.25));
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setBounds((old) =>
      old.width === layout.width && old.height === layout.height
        ? old
        : { width: layout.width, height: layout.height },
    );
  };
  const props = { p, moving: active && !reduced, active, reduced, hitSlop: Math.max(8, 24 / scale - 40) };

  return (
    <View onLayout={onLayout} accessible={false} style={styles.stage}>
      <View
        style={[
          styles.artboard,
          { left: (bounds.width - 360) / 2, top: (bounds.height - 440) / 2, transform: [{ scale }] },
        ]}
      >
        {kind === 'walk' ? (
          <WalkArt {...props} />
        ) : kind === 'story' ? (
          <StoryArt {...props} />
        ) : (
          <ChooseArt {...props} />
        )}
      </View>
    </View>
  );
}

type SceneProps = { p: Palette; moving: boolean; active: boolean; reduced: boolean; hitSlop: number };

function Decoration({ children }: { children: ReactNode }) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {children}
    </View>
  );
}

function City({ p }: { p: Palette }) {
  return (
    <Svg width={360} height={440} viewBox="0 0 360 440">
      <Path
        d="M14 107 Q28 30 124 28 L288 44 Q350 60 351 145 L350 303 Q339 393 264 411 L94 404 Q19 389 10 317Z"
        fill={p.block}
      />
      <Path
        d="M220 31 C238 117 179 143 218 224 S338 292 322 405"
        stroke={p.water}
        strokeWidth={40}
        fill="none"
      />
      <Path
        d="M20 93 337 159 M1 207 348 271 M36 361 346 330 M109 22 50 393 M197 19 157 422 M311 78 255 402"
        stroke={p.street}
        strokeWidth={15}
        strokeLinecap="round"
      />
      <Path d="m253 49 57 12 23 55-54 14-41-39Z" fill={p.park} />
      <Path d="m22 229 48 12-17 91-36-20Z" fill={p.park} />
      <Path d="m190 283 66 11-16 74-61-9Z" fill={p.park} />
      <Path
        d="m130 49 43 7-7 50-47-10Z M87 135l62 12-10 56-64-12Z M283 180l47 9-1 42-53-10Z M82 268l47 9-9 50-48-9Z"
        fill={p.paper}
      />
      <Path d="m228 235 38 7 M211 303l37 7" stroke={p.stoneLight} strokeWidth={17} />
      {(
        [
          [270, 78],
          [291, 92],
          [309, 105],
          [41, 270],
          [31, 302],
          [213, 324],
          [226, 342],
        ] as const
      ).map(([x, y]) => (
        <G key={`${x}-${y}`}>
          <Ellipse cx={x} cy={y + 8} rx={9} ry={4} fill={p.muted} opacity={0.35} />
          <Circle cx={x} cy={y} r={9} fill={p.tree} />
          <Path d={`M${x} ${y + 2}v10`} stroke={p.stoneShade} strokeWidth={2} strokeLinecap="round" />
        </G>
      ))}
    </Svg>
  );
}

/** A little architectural drawing of the Brandenburg Gate, with no image/network dependency. */
function Gate({ p, width = 220, height = 160 }: { p: Palette; width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 240 175">
      <Ellipse cx={120} cy={163} rx={117} ry={9} fill={p.stoneShade} opacity={0.15} />
      <Path d="M10 158h220v7H10z M18 149h204v9H18z" fill={p.stoneShade} />
      <Path d="M27 72h186v77H27z" fill={p.stoneShade} />
      {[40, 70, 104, 140, 174, 200].map((x) => (
        <Rect key={x} x={x} y={80} width={16} height={69} fill={p.background} />
      ))}
      {[25, 56, 90, 126, 160, 194].map((x) => (
        <G key={x}>
          <Rect x={x} y={78} width={16} height={70} fill={p.stoneLight} />
          <Path d={`M${x + 4} 81v63 M${x + 11} 81v63`} stroke={p.stone} strokeWidth={2} />
          <Rect x={x - 3} y={73} width={22} height={7} rx={1} fill={p.stone} />
          <Rect x={x - 3} y={145} width={22} height={5} rx={1} fill={p.stone} />
        </G>
      ))}
      <Path d="M17 55h206v17H17z M10 69h220v7H10z" fill={p.stone} />
      <Path d="M14 49h212v8H14z M29 40h182v9H29z" fill={p.stoneLight} />
      <Path d="M78 34h84v7H78z M102 25h37v9h-37z" fill={p.stoneShade} />
      <Path
        d="m108 25-9-12 7-3 8 9 4-8 6 2 3 11m-9-12 3-8 5 1 3 11m0 7 8-12 7 2-7 13"
        stroke={p.tree}
        strokeWidth={5}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M122 8V2m-6 3h12" stroke={p.tree} strokeWidth={3} strokeLinecap="round" />
      <Path d="M27 61h186" stroke={p.stoneLight} strokeWidth={2} strokeDasharray="4 5" />
    </Svg>
  );
}

function LandmarkBadge({
  icon,
  x,
  y,
  delay,
  moving,
  p,
}: {
  icon: string;
  x: number;
  y: number;
  delay: number;
  moving: boolean;
  p: Palette;
}) {
  return (
    <Animated.View
      style={[
        styles.placeBadge,
        {
          left: x,
          top: y,
          backgroundColor: p.paper,
          animationName: moving ? discover : undefined,
          animationDuration: '4800ms',
          animationDelay: `${delay}ms`,
          animationIterationCount: 'infinite',
          animationTimingFunction: ease,
        },
      ]}
    >
      <Icon name={icon} size={25} color={p.ink} />
      <View style={[styles.badgeStem, { backgroundColor: p.paper }]} />
    </Animated.View>
  );
}

function Waveform({ moving, p, compact = false }: { moving: boolean; p: Palette; compact?: boolean }) {
  const heights = compact ? [11, 22, 29, 18, 25, 12] : [10, 20, 32, 22, 39, 27, 17, 32, 22, 13, 25, 11];
  return (
    <View style={{ height: 42, flexDirection: 'row', alignItems: 'center', gap: compact ? 4 : 5 }}>
      {heights.map((height, index) => (
        <Animated.View
          key={index}
          style={{
            width: compact ? 4 : 5,
            height,
            borderRadius: 3,
            backgroundColor: p.accent,
            animationName: moving ? wave : undefined,
            animationDuration: `${760 + (index % 3) * 150}ms`,
            animationDelay: `${index * -120}ms`,
            animationIterationCount: 'infinite',
            animationTimingFunction: ease,
          }}
        />
      ))}
    </View>
  );
}

function WalkArt({ p, moving }: SceneProps) {
  return (
    <Decoration>
      <City p={p} />
      <Svg style={StyleSheet.absoluteFill} width={360} height={440} viewBox="0 0 360 440">
        <Path
          d="M90 359C72 313 163 301 144 237S96 163 168 143s90 7 112-38"
          fill="none"
          stroke={p.accent}
          strokeWidth={5}
          strokeDasharray="1 12"
          strokeLinecap="round"
        />
        <Circle cx={163} cy={144} r={8} fill={p.accent} stroke={p.paper} strokeWidth={4} />
        <Circle cx={280} cy={105} r={8} fill={p.accent} stroke={p.paper} strokeWidth={4} />
        <Ellipse cx={114} cy={402} rx={62} ry={10} fill={p.ink} opacity={0.08} />
      </Svg>
      <View style={{ position: 'absolute', left: 27, top: 66, transform: [{ rotate: '9deg' }] }}>
        <Gate p={p} width={130} height={100} />
      </View>
      <LandmarkBadge icon="coffee" x={271} y={171} delay={700} moving={moving} p={p} />
      <LandmarkBadge icon="headphones" x={232} y={42} delay={0} moving={moving} p={p} />
      <LandmarkBadge icon="camera" x={104} y={169} delay={1400} moving={moving} p={p} />
      <Animated.View
        style={{
          position: 'absolute',
          left: 6,
          top: 189,
          animationName: moving ? stroll : undefined,
          animationDuration: '2000ms',
          animationIterationCount: 'infinite',
          animationTimingFunction: ease,
        }}
      >
        <Mascot pose="walk" size={232} idle={false} entrance={false} />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          left: 224,
          top: 332,
          width: 110,
          height: 60,
          borderRadius: 30,
          backgroundColor: p.paper,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '-7deg' }],
          animationName: moving ? float : undefined,
          animationDuration: '3800ms',
          animationIterationCount: 'infinite',
          animationTimingFunction: ease,
        }}
      >
        <Waveform compact moving={moving} p={p} />
      </Animated.View>
    </Decoration>
  );
}

function StoryArt({ p, moving, active, reduced, hitSlop }: SceneProps) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(true);
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <Decoration>
        <Svg width={360} height={440} viewBox="0 0 360 440">
          <Circle cx={180} cy={200} r={165} fill={p.accentTint} opacity={0.6} />
          <Path
            d="M13 346c47 39 29 59 99 53s55-87 107-56 101 27 132-15"
            fill="none"
            stroke={p.muted}
            strokeWidth={3}
            strokeDasharray="1 10"
            strokeLinecap="round"
          />
          <Path
            d="m311 36 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z M29 281l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z"
            fill={p.accent}
          />
        </Svg>
        <View style={[styles.storyCard, { backgroundColor: p.paper }]}>
          <View
            style={{
              height: 202,
              backgroundColor: p.water,
              borderRadius: 20,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <Svg width={262} height={202} style={StyleSheet.absoluteFill} viewBox="0 0 262 202">
              <Circle cx={202} cy={43} r={24} fill={p.paper} opacity={0.8} />
              <Path d="M0 161q42-19 84 0t92-4 86 3v44H0Z" fill={p.park} />
              <Path
                d="M17 61h44m-9-23h40"
                stroke={p.paper}
                strokeWidth={7}
                strokeLinecap="round"
                opacity={0.7}
              />
              <Circle cx={21} cy={149} r={23} fill={p.tree} />
              <Circle cx={245} cy={150} r={28} fill={p.tree} />
            </Svg>
            <Gate p={p} width={249} height={181} />
          </View>
          <View style={{ paddingTop: 16, paddingLeft: 15 }}>
            <Waveform moving={moving && playing} p={p} />
          </View>
        </View>
        <Animated.View
          style={{
            position: 'absolute',
            left: 164,
            top: 226,
            animationName: moving && playing ? float : undefined,
            animationDuration: '3000ms',
            animationIterationCount: 'infinite',
            animationTimingFunction: ease,
          }}
        >
          <Mascot pose="listen" size={201} idle={false} entrance={false} />
        </Animated.View>
        <Animated.View
          style={{
            position: 'absolute',
            left: 30,
            top: 307,
            width: 96,
            height: 96,
            borderRadius: 48,
            borderWidth: 2,
            borderColor: p.accent,
            opacity: 0,
            animationName: moving && playing ? pulse : undefined,
            animationDuration: '2400ms',
            animationIterationCount: 'infinite',
            animationTimingFunction: 'linear',
          }}
        />
      </Decoration>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(playing ? 'player.pause' : 'player.play')}
        accessibilityHint={t('onboarding.slide2Body')}
        disabled={!active}
        hitSlop={hitSlop}
        pressRetentionOffset={16}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          haptics.tap();
          setPlaying((value) => !value);
        }}
        style={{ position: 'absolute', left: 38, top: 315, width: 80, height: 80 }}
      >
        <Animated.View
          style={[
            styles.roundControl,
            {
              backgroundColor: p.accent,
              transform: [{ scale: pressed && !reduced ? 0.96 : 1 }],
              transitionProperty: 'transform',
              transitionDuration: reduced ? 0 : 120,
            },
          ]}
        >
          <Icon name={playing ? 'pause' : 'play'} size={28} color="#FFFFFF" />
        </Animated.View>
      </Pressable>
    </>
  );
}

const choices = [
  { icon: 'compass', label: 'home.roamTitle', x: 21, y: 119, path: 'M179 335C166 274 66 302 61 200' },
  { icon: 'map', label: 'home.plannedTitle', x: 140, y: 30, path: 'M180 335C187 253 150 207 180 110' },
  { icon: 'git-branch', label: 'home.forkTitle', x: 259, y: 119, path: 'M181 335C197 279 296 296 299 200' },
] as const;

function ChooseArt({ p, moving, active, reduced, hitSlop }: SceneProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(0);
  const [pressed, setPressed] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <>
      <Decoration>
        <Svg width={360} height={440} viewBox="0 0 360 440">
          <Path
            d="M40 126C37 42 119 21 185 21s133 46 140 126-17 161-67 218-147 41-187-13S3 211 40 126"
            fill={p.block}
            opacity={0.65}
          />
          <Path d="M32 289 335 217 M41 73 306 332 M116 25 110 386" stroke={p.street} strokeWidth={12} />
          <Path
            d="M0 341c37-27 65 10 91-5s21-73 66-56 74-3 106-56 70-19 97-36"
            fill="none"
            stroke={p.water}
            strokeWidth={26}
          />
          <Circle cx={92} cy={58} r={17} fill={p.park} />
          <Circle cx={274} cy={294} r={28} fill={p.park} />
          <Circle cx={301} cy={308} r={17} fill={p.park} />
          {choices.map((choice, index) => (
            <Path
              key={choice.icon}
              d={choice.path}
              fill="none"
              stroke={index === selected ? p.accent : p.muted}
              strokeWidth={index === selected ? 5 : 3}
              strokeLinecap="round"
              strokeDasharray="1 11"
            />
          ))}
          <Ellipse cx={181} cy={405} rx={69} ry={11} fill={p.ink} opacity={0.07} />
          <Path
            d="m324 45 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z M25 240l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"
            fill={p.accent}
            opacity={0.65}
          />
        </Svg>
        <Animated.View
          style={{
            position: 'absolute',
            left: 76,
            top: 224,
            animationName: moving ? float : undefined,
            animationDuration: '3600ms',
            animationIterationCount: 'infinite',
            animationTimingFunction: ease,
          }}
        >
          <Mascot pose={tried ? 'celebrate' : 'point'} size={211} idle={false} entrance={false} />
        </Animated.View>
      </Decoration>
      {choices.map((choice, index) => (
        <Pressable
          key={choice.icon}
          accessibilityRole="button"
          accessibilityLabel={t(choice.label)}
          accessibilityState={{ selected: selected === index }}
          disabled={!active}
          hitSlop={hitSlop}
          pressRetentionOffset={16}
          onPressIn={() => setPressed(index)}
          onPressOut={() => setPressed(null)}
          onPress={() => {
            haptics.select();
            setSelected(index);
            setTried(true);
          }}
          style={{ position: 'absolute', left: choice.x, top: choice.y, width: 80, height: 80 }}
        >
          <Animated.View
            style={[
              styles.roundControl,
              styles.choiceShadow,
              {
                backgroundColor: selected === index ? p.accent : p.paper,
                transform: [
                  { translateY: selected === index && !reduced ? -5 : 0 },
                  { scale: pressed === index && !reduced ? 0.96 : 1 },
                ],
                transitionProperty: ['backgroundColor', 'transform'],
                transitionDuration: reduced ? 0 : 180,
              },
            ]}
          >
            <Icon name={choice.icon} size={31} color={selected === index ? '#FFFFFF' : p.ink} />
            {selected === index && (
              <View style={[styles.selectedMark, { backgroundColor: p.paper }]}>
                <Icon name="check" size={14} color={p.accent} />
              </View>
            )}
          </Animated.View>
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, minHeight: 0, overflow: 'hidden' },
  artboard: { position: 'absolute', width: 360, height: 440 },
  placeBadge: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 5px 12px rgba(40, 33, 24, 0.08)',
  },
  badgeStem: { position: 'absolute', width: 12, height: 12, bottom: -4, transform: [{ rotate: '45deg' }] },
  storyCard: {
    position: 'absolute',
    left: 28,
    top: 40,
    width: 286,
    height: 288,
    borderRadius: 30,
    borderCurve: 'continuous',
    padding: 12,
    transform: [{ rotate: '-6deg' }],
    boxShadow: '0 12px 22px rgba(60, 48, 33, 0.10)',
  },
  roundControl: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  choiceShadow: {
    boxShadow: '0 7px 14px rgba(60, 48, 33, 0.08)',
  },
  selectedMark: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

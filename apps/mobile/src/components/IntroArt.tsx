import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { BRAND_RED, metrics, sys } from '../theme';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { Text } from './Text';

export type IntroKind = 'walk' | 'story' | 'choose';

/**
 * Illustrations for the intro: they show what the app does instead of describing it. A walk with stops and Tuu, a
 * place card with its play badge (the thing people tap), and the three ways to start. Pure drawing, no network.
 */
export function IntroArt({ kind }: { kind: IntroKind }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: 280,
        borderRadius: 32,
        borderCurve: 'continuous',
        backgroundColor: sys.accentTint,
        overflow: 'hidden',
      }}
    >
      {kind === 'walk' ? <WalkArt /> : kind === 'story' ? <StoryArt /> : <ChooseArt />}
    </View>
  );
}

function Pin({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: x - 15,
        top: y - 15,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: sys.accent,
        borderWidth: 3,
        borderColor: sys.elevated,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="caption" color={sys.onAccent} style={{ fontWeight: '700' }} allowFontScaling={false}>
        {n}
      </Text>
    </View>
  );
}

function WalkArt() {
  return (
    <>
      <Svg width="100%" height="100%" viewBox="0 0 340 280" preserveAspectRatio="xMidYMid slice">
        {/* streets */}
        <Path d="M-10 70 L350 40" stroke={sys.elevated as string} strokeWidth={16} strokeLinecap="round" />
        <Path d="M60 -10 L100 290" stroke={sys.elevated as string} strokeWidth={14} strokeLinecap="round" />
        <Path d="M-10 200 L350 170" stroke={sys.elevated as string} strokeWidth={12} strokeLinecap="round" />
        <Circle cx={270} cy={110} r={34} fill={sys.elevated as string} opacity={0.6} />
        {/* the route */}
        <Path
          d="M60 220 C 100 160, 90 110, 150 100 S 250 70, 285 50"
          stroke={BRAND_RED}
          strokeWidth={5}
          strokeDasharray="1 11"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <Pin x={150} y={100} n={1} />
      <Pin x={285} y={52} n={2} />
      <View style={{ position: 'absolute', left: 20, bottom: 6 }}>
        <Mascot pose="walk" size={150} />
      </View>
      <View
        style={{
          position: 'absolute',
          right: 18,
          bottom: 22,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          height: 44,
          borderRadius: 22,
          backgroundColor: sys.elevated,
        }}
      >
        <Icon name="headphones" size={20} color={sys.accentText} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          {[10, 18, 26, 16, 22, 12].map((h, i) => (
            <View key={i} style={{ width: 4, height: h, borderRadius: 2, backgroundColor: sys.accent }} />
          ))}
        </View>
      </View>
    </>
  );
}

function StoryArt() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: 250,
          borderRadius: metrics.radius.card,
          borderCurve: 'continuous',
          backgroundColor: sys.elevated,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          marginBottom: 20,
        }}
      >
        <View
          style={{ height: 120, backgroundColor: sys.fill, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="bank" size={56} color={sys.labelTertiary} />
          <View
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 34,
              paddingLeft: 10,
              paddingRight: 14,
              borderRadius: 17,
              backgroundColor: sys.accent,
            }}
          >
            <Icon name="play" size={13} color={sys.onAccent} />
            <Text variant="footnote" color={sys.onAccent} style={{ fontWeight: '600' }}>
              {t('home.listen')}
            </Text>
          </View>
        </View>
        <View style={{ padding: 12, gap: 2 }}>
          <Text variant="headline">{t('onboarding.sampleName')}</Text>
          <Text variant="footnote">{t('onboarding.sampleMeta')}</Text>
        </View>
      </View>
      <View style={{ position: 'absolute', right: 14, bottom: -6 }}>
        <Mascot pose="listen" size={116} />
      </View>
    </View>
  );
}

function ChooseArt() {
  const { t } = useTranslation();
  const tiles = [
    { icon: 'compass', label: t('home.roamTitle') },
    { icon: 'edit-3', label: t('home.plannedTitle') },
    { icon: 'git-branch', label: t('home.forkTitle') },
  ];
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20, gap: 10 }}>
      {tiles.map((x) => (
        <View
          key={x.icon}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 14,
            height: 56,
            borderRadius: 18,
            borderCurve: 'continuous',
            backgroundColor: sys.elevated,
            marginRight: x.icon === 'compass' ? 70 : 0,
          }}
        >
          <Icon name={x.icon} size={22} color={sys.accentText} />
          <Text variant="headline">{x.label}</Text>
        </View>
      ))}
      <View style={{ position: 'absolute', right: 6, top: 14 }}>
        <Mascot pose="point" size={104} />
      </View>
    </View>
  );
}

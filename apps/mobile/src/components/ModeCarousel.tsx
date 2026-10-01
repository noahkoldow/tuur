import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { colors, radii, shadow } from '../theme';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { SnapCarousel } from './SnapCarousel';
import { Text } from './Text';

export type ModeKind = 'planned' | 'fork' | 'roam';

export interface ModeItem {
  kind: ModeKind;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  cta: string;
  onPress: () => void;
}

/** Swipeable mode picker built on the snapping carousel (one card per mode). */
export function ModeCarousel({ items }: { items: ModeItem[] }) {
  const { t } = useTranslation();
  return (
    <SnapCarousel
      peek={28}
      items={items.map((m, i) => ({
        key: m.kind,
        label: m.title,
        node: <ModeCard item={m} a11yPosition={t('home.modeOf', { index: i + 1, total: items.length })} />,
      }))}
    />
  );
}

function ModeCard({ item, a11yPosition }: { item: ModeItem; a11yPosition: string }) {
  // the whole card starts the mode; the button is the visible affordance
  return (
    <PressableScale
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}`}
      accessibilityHint={a11yPosition}
      onPress={item.onPress}
      style={{
        backgroundColor: colors.surface.base,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        ...shadow.card,
      }}
    >
      <View style={{ height: 76, backgroundColor: colors.brand.redTint }}>
        <ModeArt kind={item.kind} />
        <View
          style={{
            position: 'absolute',
            top: 14,
            left: 16,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.surface.base,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={item.icon} size={22} color={colors.brand.redPressed} />
        </View>
      </View>
      <View style={{ padding: 16, gap: 8 }}>
        <Text variant="title">{item.title}</Text>
        <Text variant="bodySecondary" numberOfLines={2} style={{ minHeight: 44 }}>
          {item.body}
        </Text>
        <Button label={item.cta} icon="arrow-right" onPress={item.onPress} style={{ marginTop: 4 }} />
      </View>
    </PressableScale>
  );
}

/** Small route drawing per mode on the tinted card header: planned = fixed route, fork = split, roam = free path. */
function ModeArt({ kind }: { kind: ModeKind }) {
  const red = colors.brand.red;
  const dot = (cx: number, cy: number, r = 6) => (
    <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={red} stroke="#FFFFFF" strokeWidth={3} />
  );
  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 88" preserveAspectRatio="xMaxYMid slice">
      {kind === 'planned' ? (
        <>
          <Path
            d="M96 66 C 140 66, 150 24, 196 30 S 250 70, 296 26"
            stroke={red}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
          />
          {[dot(96, 66), dot(196, 30), dot(252, 58), dot(296, 26, 8)]}
        </>
      ) : kind === 'fork' ? (
        <>
          <Path d="M96 60 L 200 46" stroke={red} strokeWidth={4} fill="none" strokeLinecap="round" />
          <Path
            d="M200 46 C 236 40, 256 20, 296 18"
            stroke={red}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M200 46 C 236 52, 256 74, 296 72"
            stroke={red}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="2 9"
          />
          {[dot(96, 60), dot(200, 46, 7), dot(296, 18), dot(296, 72)]}
        </>
      ) : (
        <>
          <Path
            d="M96 62 C 120 30, 150 80, 176 50 S 226 18, 246 46 S 286 70, 304 36"
            stroke={red}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="2 9"
          />
          {[dot(96, 62), dot(176, 50, 5), dot(246, 46, 5)]}
          <Path
            d="M290 22 a 14 14 0 0 1 0 28"
            stroke={red}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M298 14 a 24 24 0 0 1 0 44"
            stroke={red}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            opacity={0.5}
          />
        </>
      )}
    </Svg>
  );
}

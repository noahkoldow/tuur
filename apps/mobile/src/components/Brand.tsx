import { Image, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MARK_ASPECT_RATIO, MARK_PATH, MARK_VIEWBOX } from '@tuur/ui';
import { sys } from '../theme';
import { Glass } from './Glass';
import wordmark from '../../assets/wordmark-red.png';

/** The tuur wordmark (red). One per screen at most: branding defers to content (branding.md). */
export function Wordmark({ width = 72, decorative }: { width?: number; decorative?: boolean }) {
  return (
    <Image
      source={wordmark}
      accessible={!decorative}
      accessibilityRole="image"
      accessibilityLabel="tuur"
      style={{ width, height: width * (24 / 64) }}
      resizeMode="contain"
    />
  );
}

/** Wordmark on a small glass capsule that floats over the map (the home screen's one brand moment). */
export function WordmarkPill() {
  return (
    <Glass
      style={{
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Wordmark width={64} decorative />
    </Glass>
  );
}

/** The heart-pin mark as a static glyph (about areas, empty states). */
export function BrandMark({
  size = 32,
  color = sys.accent,
}: {
  size?: number;
  color?: string | typeof sys.accent;
}) {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size / MARK_ASPECT_RATIO} viewBox={MARK_VIEWBOX}>
        <Path d={MARK_PATH} fill={color as string} fillRule="evenodd" />
      </Svg>
    </View>
  );
}

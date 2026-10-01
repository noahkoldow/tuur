import Svg, { Path } from 'react-native-svg';
import { View } from 'react-native';
import type { Interest } from '@tuur/shared';
import { MARK_ASPECT_RATIO, MARK_PATH, MARK_VIEWBOX, colors, fonts } from '@tuur/ui';
import { Icon } from './Icon';
import { INTEREST_ICON } from './icons';
import { Text } from './Text';

export type PinState = 'current' | 'visited' | 'upcoming';

interface Props {
  number?: number;
  /** Category glyph inside the heart, so the kind of stop is visible at a glance. */
  interest?: Interest;
  state?: PinState;
  size?: number;
  /** Partner stops use the same shape with a clearly separate "Partner" badge (spec 2.2/7.3). */
  partner?: boolean;
  partnerLabel?: string;
}

/** Map pin widths: compact so dense tours stay readable; the current stop is slightly larger. */
export const pinSize = (state: PinState = 'upcoming') => (state === 'current' ? 40 : 30);

/**
 * Map marker in the silhouette of the brand mark: current = red fill, visited = grey, upcoming = red outline. The
 * category glyph sits in the heart, the stop number in a small badge; the tip marks the coordinate (anchor bottom).
 */
export function HeartPin({
  number,
  interest,
  state = 'upcoming',
  size = pinSize(),
  partner,
  partnerLabel = 'Partner',
}: Props) {
  const filled = state !== 'upcoming';
  const fill = state === 'visited' ? colors.marker.visited : colors.marker.current;
  const w = size;
  const h = size / MARK_ASPECT_RATIO;
  const glyph = interest ? INTEREST_ICON[interest] : undefined;
  const glyphColor = filled ? '#FFFFFF' : colors.brand.redPressed;
  const badge = Math.max(14, Math.round(size * 0.46));
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'flex-end',
        // touch target of at least 44 pt around a smaller pin; the tip stays at the bottom edge (anchor)
        minWidth: 44,
        minHeight: 44,
        paddingTop: number !== undefined ? badge / 3 : 0,
        paddingRight: badge / 3,
      }}
      accessible
      accessibilityLabel={number !== undefined ? `${number}` : undefined}
    >
      <View style={{ width: w, height: h }}>
        <Svg width={w} height={h} viewBox={MARK_VIEWBOX}>
          <Path
            d={MARK_PATH}
            fill={filled ? fill : '#FFFFFF'}
            stroke={filled ? '#FFFFFF' : colors.brand.red}
            strokeWidth={filled ? 22 : 40}
            strokeLinejoin="round"
            fillRule="evenodd"
          />
        </Svg>
        {glyph ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, top: h * 0.4, alignItems: 'center' }}
          >
            <Icon name={glyph} size={Math.round(w * 0.36)} color={glyphColor} weight="semibold" />
          </View>
        ) : null}
        {number !== undefined ? (
          <View
            style={{
              position: 'absolute',
              top: -badge / 3,
              right: -badge / 3,
              minWidth: badge,
              height: badge,
              paddingHorizontal: 3,
              borderRadius: badge / 2,
              backgroundColor: state === 'visited' ? colors.marker.visited : colors.ink.primary,
              borderWidth: 1.5,
              borderColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              allowFontScaling={false}
              style={{
                fontFamily: fonts.heading,
                fontSize: badge * 0.6,
                lineHeight: badge * 0.8,
                color: '#FFFFFF',
              }}
            >
              {String(number)}
            </Text>
          </View>
        ) : null}
      </View>
      {partner ? (
        <View
          style={{
            marginTop: 2,
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 8,
            backgroundColor: colors.brand.redTint,
            borderWidth: 1,
            borderColor: colors.brand.red,
          }}
        >
          <Text variant="caption" color={colors.brand.redPressed} style={{ fontSize: 10, lineHeight: 13 }}>
            {partnerLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

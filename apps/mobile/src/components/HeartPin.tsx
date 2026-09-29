import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { View } from 'react-native';
import { MARK_ASPECT_RATIO, MARK_PATH, MARK_VIEWBOX, colors } from '@tuur/ui';
import { Text } from './Text';

export type PinState = 'current' | 'visited' | 'upcoming';

interface Props {
  number?: number;
  state?: PinState;
  size?: number;
  /** Partner stops use the same shape with a clearly separate "Partner" badge (spec 2.2/7.3). */
  partner?: boolean;
  partnerLabel?: string;
}

const [VB_W, VB_H] = MARK_VIEWBOX.split(' ').slice(2).map(Number) as [number, number];

/**
 * Map marker in the silhouette of the brand mark: current = red fill with white number, visited = grey,
 * upcoming = red outline. The tip of the heart marks the coordinate (anchor bottom).
 */
export function HeartPin({
  number,
  state = 'upcoming',
  size = 44,
  partner,
  partnerLabel = 'Partner',
}: Props) {
  const filled = state !== 'upcoming';
  const fill = state === 'visited' ? colors.marker.visited : colors.marker.current;
  const w = size;
  const h = size / MARK_ASPECT_RATIO;
  return (
    <View
      style={{ alignItems: 'center' }}
      accessible
      accessibilityLabel={number !== undefined ? `${number}` : undefined}
    >
      <Svg width={w} height={h} viewBox={MARK_VIEWBOX}>
        <Path
          d={MARK_PATH}
          fill={filled ? fill : '#FFFFFF'}
          stroke={filled ? '#FFFFFF' : colors.brand.red}
          strokeWidth={filled ? 14 : 44}
          strokeLinejoin="round"
          fillRule="evenodd"
        />
        {number !== undefined ? (
          <G>
            <SvgText
              x={VB_W / 2}
              y={VB_H * 0.78}
              fontSize={VB_H * 0.3}
              fontWeight="800"
              textAnchor="middle"
              fill={filled ? '#FFFFFF' : colors.brand.redPressed}
            >
              {String(number)}
            </SvgText>
          </G>
        ) : null}
      </Svg>
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

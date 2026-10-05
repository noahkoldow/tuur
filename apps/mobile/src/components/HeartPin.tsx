import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Interest } from '@tuur/shared';
import { categoryColors, mapMarker, radii, sys } from '../theme';
import { Icon } from './Icon';
import { INTEREST_ICON } from './icons';
import { Text } from './Text';

export type PinState = 'current' | 'visited' | 'upcoming';

interface Props {
  number?: number;
  interest?: Interest;
  state?: PinState;
  size?: number;
  /** Partner status stays explicit alongside the same stop number/category treatment. */
  partner?: boolean;
  partnerLabel?: string;
}

export const pinSize = (state: PinState = 'upcoming') =>
  state === 'current' ? mapMarker.currentHeight : mapMarker.stopHeight;

/**
 * Category hue and glyph identify the kind of stop. The current stop is filled and larger; upcoming stops
 * have a tinted surface, and completed stops retain their number alongside a check.
 */
export function HeartPin({
  number,
  interest,
  state = 'upcoming',
  size = pinSize(state),
  partner,
  partnerLabel = 'Partner',
}: Props) {
  const { t } = useTranslation();
  const current = state === 'current';
  const visited = state === 'visited';
  const tone = interest ? categoryColors[interest] : undefined;
  const foreground = current
    ? (tone?.onSolid ?? sys.onAccent)
    : visited
      ? sys.labelSecondary
      : (tone?.foreground ?? sys.label);
  const glyph = visited ? 'check' : interest ? INTEREST_ICON[interest] : 'map-pin';
  const label = [
    number,
    t(current ? 'map.next' : visited ? 'map.walked' : 'map.ahead'),
    interest ? t(`interests.${interest}`) : undefined,
    partner ? partnerLabel : undefined,
  ]
    .filter((value) => value !== undefined)
    .join(', ');
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        minWidth: mapMarker.hit,
        minHeight: mapMarker.hit,
        paddingHorizontal: 4,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          height: size,
          minWidth: size,
          paddingHorizontal: mapMarker.inset,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: mapMarker.gap,
          borderRadius: radii.pill,
          backgroundColor: current
            ? (tone?.solid ?? sys.accent)
            : visited
              ? sys.elevated
              : (tone?.background ?? sys.elevated),
          borderWidth: current ? 2 : 1,
          borderColor: current ? sys.elevated : visited ? sys.separator : (tone?.foreground ?? sys.separator),
          boxShadow: current ? mapMarker.selectedShadow : mapMarker.shadow,
        }}
      >
        {number !== undefined ? (
          <Text
            variant="label"
            color={foreground}
            maxFontSizeMultiplier={1.2}
            style={{ fontVariant: ['tabular-nums'], fontWeight: '700' }}
          >
            {number}
          </Text>
        ) : null}
        <Icon
          name={glyph}
          size={current ? mapMarker.icon : mapMarker.compactIcon}
          color={foreground}
          weight="semibold"
        />
        {partner ? (
          <Text variant="caption" color={foreground} maxFontSizeMultiplier={1.2}>
            {partnerLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

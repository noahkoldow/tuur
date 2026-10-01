import { Children, Fragment, isValidElement } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radii } from '../theme';
import { Text } from './Text';

/** Grouped settings list: a caption above a white rounded card whose rows are separated by hairlines. */
export function ListGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: 8 }}>
      {title ? (
        <Text
          variant="label"
          accessibilityRole="header"
          style={{
            color: colors.ink.secondary,
            paddingHorizontal: 4,
            textTransform: 'uppercase',
            fontSize: 12,
          }}
        >
          {title}
        </Text>
      ) : null}
      <View style={{ backgroundColor: colors.surface.base, borderRadius: radii.lg, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 60 }} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="caption" style={{ paddingHorizontal: 4 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** One row: icon tile, label with optional hint, and a chevron (navigates) or a custom trailing control. */
export function ListRow({
  icon,
  label,
  hint,
  value,
  onPress,
  trailing,
  destructive,
  external,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  hint?: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  destructive?: boolean;
  /** Opens outside the app (system settings): shows an external-link glyph instead of the chevron. */
  external?: boolean;
}) {
  const tint = destructive ? colors.status.error : colors.ink.primary;
  const body = (
    <>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: destructive ? colors.surface.subtle : colors.brand.redTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={17} color={destructive ? colors.status.error : colors.brand.redPressed} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" style={{ color: tint }}>
          {label}
        </Text>
        {hint ? <Text variant="caption">{hint}</Text> : null}
      </View>
      {value ? <Text variant="bodySecondary">{value}</Text> : null}
      {trailing ??
        (onPress ? (
          <Feather
            name={external ? 'external-link' : 'chevron-right'}
            size={18}
            color={colors.ink.tertiary}
          />
        ) : null)}
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
  };
  if (!onPress)
    return (
      <View style={style} accessible={!trailing}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={({ pressed }) => [style, pressed ? { backgroundColor: colors.surface.subtle } : null]}
    >
      {body}
    </Pressable>
  );
}

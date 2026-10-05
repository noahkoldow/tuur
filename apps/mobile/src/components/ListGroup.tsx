import { Children, Fragment, isValidElement } from 'react';
import { Pressable, View } from 'react-native';
import type { Interest } from '@tuur/shared';
import { useTranslation } from 'react-i18next';
import { haptics } from '../motion';
import { categoryColors, metrics, sys } from '../theme';
import { Icon } from './Icon';
import { INTEREST_ICON } from './icons';
import { CategoryBadge } from './category-badge';
import { Text } from './Text';

const ICON_COL = 22;
const GAP = 12;

/** Inset grouped list (lists-and-tables.md): small caps header, rounded elevated container, hairline separators. */
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
    <View style={{ gap: 6 }}>
      {title ? (
        <Text
          variant="footnote"
          accessibilityRole="header"
          style={{ paddingHorizontal: metrics.margin, textTransform: 'uppercase' }}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: sys.elevated,
          borderRadius: metrics.radius.card,
          borderCurve: 'continuous',
          overflow: 'hidden',
        }}
      >
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? (
              <View
                style={{
                  height: 0.5,
                  backgroundColor: sys.separator,
                  marginLeft: metrics.margin + ICON_COL + GAP,
                }}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="footnote" style={{ paddingHorizontal: metrics.margin }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One row: a quiet leading symbol, the label (with an optional footnote), a value and either a chevron (navigates) or a
 * custom trailing control. At least 44 pt tall; it grows with the text size.
 */
export function ListRow({
  icon,
  label,
  hint,
  value,
  onPress,
  trailing,
  destructive,
  external,
  interest,
}: {
  icon?: string;
  label: string;
  hint?: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  destructive?: boolean;
  /** Opens outside the app (system settings): shows an external-link glyph instead of the chevron. */
  external?: boolean;
  interest?: Interest | undefined;
}) {
  const { t } = useTranslation();
  const tint = destructive ? sys.error : sys.label;
  const body = (
    <>
      {icon ? (
        <View style={{ width: ICON_COL, alignItems: 'center' }}>
          <Icon name={icon} size={20} color={destructive ? sys.error : sys.labelSecondary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" style={{ color: tint }}>
          {label}
        </Text>
        {hint ? <Text variant="footnote">{hint}</Text> : null}
        {interest ? <CategoryBadge interest={interest} /> : null}
      </View>
      {value ? (
        <Text variant="body" color={sys.labelSecondary} style={{ flexShrink: 1, textAlign: 'right' }}>
          {value}
        </Text>
      ) : null}
      {trailing ??
        (onPress ? (
          <Icon
            name={external ? 'external-link' : 'chevron-right'}
            size={external ? 18 : 14}
            color={sys.labelTertiary}
            weight="semibold"
          />
        ) : null)}
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: GAP,
    minHeight: 44,
    paddingHorizontal: metrics.margin,
    paddingVertical: 11,
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
      accessibilityLabel={[label, hint, interest ? t(`interests.${interest}`) : undefined]
        .filter(Boolean)
        .join('. ')}
      onPress={onPress}
      style={({ pressed }) => [style, pressed ? { backgroundColor: sys.fill } : null]}
    >
      {body}
    </Pressable>
  );
}

export interface Choice {
  id: string;
  label: string;
  detail?: string;
  interest?: Interest;
}

/**
 * Picker as an inline-expanding list (pickers.md): the row shows the current choice; opening it reveals checkmark
 * rows. Single choice closes on selection; `multiple` stays open so several can be toggled.
 */
export function ChoiceRows({
  icon,
  label,
  hint,
  choices,
  selected,
  onChange,
  multiple,
  open,
  onToggle,
}: {
  icon?: string;
  label: string;
  hint?: string;
  choices: Choice[];
  selected: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const value = choices
    .filter((c) => selected.includes(c.id))
    .map((c) => c.label)
    .join(', ');
  const selectedInterests = choices.filter((c) => c.interest && selected.includes(c.id));
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
        onPress={onToggle}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: GAP,
            minHeight: 44,
            paddingHorizontal: metrics.margin,
            paddingVertical: 11,
          },
          pressed ? { backgroundColor: sys.fill } : null,
        ]}
      >
        {icon ? (
          <View style={{ width: ICON_COL, alignItems: 'center' }}>
            <Icon name={icon} size={20} color={sys.labelSecondary} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body">{label}</Text>
          {hint ? <Text variant="footnote">{hint}</Text> : null}
          {selectedInterests.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 6 }}>
              {selectedInterests.map((choice) => (
                <CategoryBadge key={choice.id} interest={choice.interest!} />
              ))}
            </View>
          ) : null}
        </View>
        {value && !selectedInterests.length ? (
          <Text variant="body" color={sys.labelSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>
            {value}
          </Text>
        ) : null}
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={sys.labelTertiary}
          weight="semibold"
        />
      </Pressable>
      {open
        ? choices.map((c) => {
            const on = selected.includes(c.id);
            const tone = c.interest ? categoryColors[c.interest] : undefined;
            return (
              <Pressable
                key={c.id}
                accessibilityRole={multiple ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: on }}
                accessibilityLabel={c.detail ? `${c.label}. ${c.detail}` : c.label}
                onPress={() => {
                  haptics.select();
                  if (multiple) onChange(on ? selected.filter((x) => x !== c.id) : [...selected, c.id]);
                  else {
                    onChange([c.id]);
                    onToggle();
                  }
                }}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: GAP,
                    minHeight: 44,
                    paddingVertical: 10,
                    paddingRight: metrics.margin,
                    paddingLeft: metrics.margin + ICON_COL + GAP,
                    borderTopWidth: 0.5,
                    borderTopColor: sys.separator,
                    backgroundColor: on && tone ? tone.background : undefined,
                  },
                  pressed ? { backgroundColor: sys.fill } : null,
                ]}
              >
                {c.interest ? (
                  <View style={{ width: ICON_COL, alignItems: 'center' }}>
                    <Icon name={INTEREST_ICON[c.interest]} size={20} color={tone!.foreground} />
                  </View>
                ) : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" color={tone?.foreground ?? sys.label}>
                    {c.label}
                  </Text>
                  {c.detail ? <Text variant="footnote">{c.detail}</Text> : null}
                </View>
                {on ? (
                  <Icon name="check" size={18} color={tone?.foreground ?? sys.accent} weight="semibold" />
                ) : null}
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

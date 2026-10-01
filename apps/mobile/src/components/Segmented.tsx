import { Pressable, View } from 'react-native';
import { haptics } from '../motion';
import { sys } from '../theme';
import { Text } from './Text';

export interface Segment<T extends string | number> {
  value: T;
  label: string;
}

/**
 * Segmented control for 2-5 mutually exclusive, short options (pickers.md / segmented controls): one gray track, the
 * selected segment lifted on an elevated pill. Each segment is at least 44 pt tall and the labels shrink instead of
 * wrapping, so five durations still fit on one line.
 */
export function Segmented<T extends string | number>({
  segments,
  value,
  onChange,
  label,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', padding: 3, gap: 2, borderRadius: 999, backgroundColor: sys.fill }}
    >
      {segments.map((s) => {
        const on = s.value === value;
        return (
          <Pressable
            key={String(s.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={s.label}
            onPress={() => {
              if (!on) {
                haptics.select();
                onChange(s.value);
              }
            }}
            style={{
              flex: 1,
              minHeight: 44,
              paddingHorizontal: 6,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              backgroundColor: on ? sys.elevated : 'transparent',
              shadowColor: '#000',
              shadowOpacity: on ? 0.12 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
            }}
          >
            <Text
              variant="subheadline"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{ fontWeight: on ? '600' : '400', color: sys.label }}
            >
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

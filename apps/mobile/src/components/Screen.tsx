import { ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metrics, sys } from '../theme';

/**
 * Plain screen without a native header: honors the safe areas and uses the 16 pt side margin of the iPhone layout
 * (layout.md). `grouped` switches to the grouped-list background.
 */
export function Screen({
  children,
  style,
  padded = true,
  grouped,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  grouped?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: grouped ? sys.grouped : sys.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingHorizontal: padded ? metrics.margin : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Scrolling screen under a native navigation bar: content starts below the (large-title) header and slides beneath
 * the translucent bars, which is what produces the system's scroll edge effect.
 */
export function ScrollScreen({
  children,
  grouped = true,
  contentContainerStyle,
  ...rest
}: ScrollViewProps & { grouped?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: grouped ? sys.grouped : sys.background }}
      contentContainerStyle={[
        { gap: 24, padding: metrics.margin, paddingBottom: insets.bottom + 32 },
        contentContainerStyle,
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

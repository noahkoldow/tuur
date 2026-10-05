import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

/** Keep the choice readable in small windows and at accessibility text sizes. */
export function OptionCards({ children }: { children: React.ReactNode }) {
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number>();
  const stacked = (measuredWidth ?? width - 32) < 344 || fontScale > 1.2;
  return (
    <View
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: stacked ? 'column' : 'row', alignItems: 'stretch', gap: 12 }}
    >
      {children}
    </View>
  );
}

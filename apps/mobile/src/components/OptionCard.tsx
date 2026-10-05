import { View } from 'react-native';
import type { Poi } from '@tuur/shared';
import { PlaceCard } from './PlaceCard';

/** Crossroads options share the place preview and explicit navigation action. */
export function OptionCard({
  poi,
  walkMinutes,
  teaser,
  onPress,
  disabled = false,
}: {
  poi: Poi;
  walkMinutes: number;
  teaser?: string | undefined;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
      <PlaceCard
        poi={poi}
        minutes={Math.round(walkMinutes)}
        teaser={teaser}
        width="100%"
        navigate
        disabled={disabled}
        onNavigate={onPress}
      />
    </View>
  );
}

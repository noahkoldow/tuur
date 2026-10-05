import { View } from 'react-native';
import { LocateButton } from './MapControls';
import { MapActionsMenu } from './MapActionsMenu';

export interface MapActionControlsProps {
  onLocate: () => void;
  onFindPause: () => void;
  /** Omit outside an active tour. */
  onToggleTourPause?: () => void;
  tourPaused?: boolean;
  /** Omit when the parent already positions its floating controls. */
  bottom?: number;
}

/** Map actions sit above the familiar location control; the menu opens above its trigger. */
export function MapActionControls({ onLocate, bottom, ...actions }: MapActionControlsProps) {
  return (
    <View
      pointerEvents="box-none"
      style={[
        { alignItems: 'flex-end', gap: 8 },
        bottom === undefined ? undefined : { position: 'absolute', right: 16, bottom },
      ]}
    >
      <MapActionsMenu {...actions} />
      <LocateButton onPress={onLocate} />
    </View>
  );
}

export type MapActionsMenuProps = Pick<
  MapActionControlsProps,
  'onFindPause' | 'onToggleTourPause' | 'tourPaused'
>;

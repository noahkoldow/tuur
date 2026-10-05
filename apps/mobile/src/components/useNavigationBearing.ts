import { useEffect, useState } from 'react';
import { navigationBearing } from './mapNavigation';

/** Navigation follows GPS travel direction; the phone compass only controls the position marker. */
export function useNavigationBearing(enabled: boolean, heading?: number, speed?: number): number | undefined {
  const [bearing, setBearing] = useState<number | undefined>(() =>
    enabled ? navigationBearing(undefined, heading, speed) : undefined,
  );

  useEffect(() => {
    setBearing((previous) => (enabled ? navigationBearing(previous, heading, speed) : undefined));
  }, [enabled, heading, speed]);

  return enabled ? bearing : undefined;
}

import { useArea } from '../location/useArea';

/** Text navigation and planning are free; the player separately authorizes audio. */
export function useSessionGate(
  _mode: 'planned' | 'fork' | 'roam',
  position: { lat: number; lng: number } | null,
) {
  const { placeId, phase, reload } = useArea(position, { tours: false });
  return {
    unlocked: true,
    placeId,
    error: phase === 'failed',
    reload,
    require: freeTextAccess,
  };
}

const freeTextAccess = () => true;

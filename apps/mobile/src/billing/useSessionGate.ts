import { useRouter } from 'expo-router';
import { useArea } from '../location/useArea';
import { canUseSession, useEntitlementStore } from './entitlements';

/** Gate for the dynamic modes (24 h session per place, or subscription). */
export function useSessionGate(
  mode: 'planned' | 'fork' | 'roam',
  position: { lat: number; lng: number } | null,
) {
  const router = useRouter();
  const ent = useEntitlementStore();
  const { placeId } = useArea(position);
  const unlocked = canUseSession(ent, mode, placeId);
  return {
    unlocked,
    placeId,
    /** Returns true when the mode may start; otherwise opens the paywall. */
    require(): boolean {
      if (unlocked) return true;
      if (placeId) router.push({ pathname: '/paywall', params: { kind: 'session', placeId, mode } });
      return false;
    },
  };
}

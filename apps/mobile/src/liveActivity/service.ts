import type { ActiveSession } from '../guide/session';

/** Android and web keep their existing player; iOS resolves service.ios.ts. */
export function initializeTourLiveActivities(): void {}

export function attachTourLiveActivity(
  _session: ActiveSession,
  _currentSession?: () => ActiveSession,
): () => void {
  return () => undefined;
}

import { useSyncExternalStore } from 'react';
import type { ActiveSession } from './session';
import type { NavigationRouteState } from './navigation-route';

const EMPTY: NavigationRouteState = { status: 'idle', leg: [], ahead: [] };
const noopSubscribe = () => () => undefined;
const emptySnapshot = () => EMPTY;

export function useNavigationRoute(session: ActiveSession) {
  return useSyncExternalStore(
    session.navigation?.subscribe ?? noopSubscribe,
    session.navigation?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
}

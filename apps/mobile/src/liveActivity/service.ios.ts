import { AppState } from 'react-native';
import type { ActiveSession } from '../guide/session';
import { useSettings } from '../state/settings';
import { createLiveActivityController } from './controller';
import { buildLiveActivityContent } from './model';
import { loadTourActivity } from './nativeFactory.ios';

let controller: ReturnType<typeof createLiveActivityController> | undefined;
let attempted = false;

function getController() {
  if (attempted) return controller;
  attempted = true;
  try {
    const factory = loadTourActivity();
    if (!factory) return undefined;
    controller = createLiveActivityController(factory, { url: () => 'tuur://play' });
    void controller.setForeground(AppState.currentState === 'active');
    void controller.initialize();
  } catch {
    // A Live Activity is optional; lack of system support must never prevent a tour starting.
  }
  return controller;
}

/** Active sessions are memory-only, so activities from an earlier process cannot resume a tour. */
export function initializeTourLiveActivities(): void {
  getController();
}

/** Session-owned subscriptions survive screen changes and continue with the existing background GPS task. */
export function attachTourLiveActivity(
  session: ActiveSession,
  currentSession: () => ActiveSession = () => session,
): () => void {
  const activity = getController();
  if (!activity) return () => undefined;
  const { runtime, recordId } = session;
  let stopped = false;
  const publish = () => {
    if (stopped) return;
    const current = currentSession();
    const lang = useSettings.getState().language;
    const lastFix = runtime.getState().travel.last;
    const locationStale =
      Boolean(current.foregroundOnly && AppState.currentState !== 'active') ||
      Boolean(lastFix && Date.now() - lastFix.ts > 60_000);
    const title = current.title ?? current.tour?.texts[lang]?.title;
    void activity.setSession(
      recordId,
      buildLiveActivityContent(runtime.getSnapshot(), {
        mode: current.mode,
        lang,
        ...(title ? { title } : {}),
        locationStale,
        ...(current.navigation ? { navigation: current.navigation.getSnapshot() } : {}),
      }),
    );
  };
  const unsubscribe = runtime.subscribe(publish);
  const unsubscribeNavigation = session.navigation?.subscribe(publish);
  const unsubscribeSettings = useSettings.subscribe((next, previous) => {
    if (next.language !== previous.language) publish();
  });
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    // Apply stale-position copy before the foreground transition can retry a failed start.
    publish();
    void activity.setForeground(state === 'active');
  });
  // GPS can stop without a runtime emission. Hide the last distance while JS still has background time.
  const freshnessTimer = setInterval(publish, 15_000);
  publish();
  void activity.setForeground(AppState.currentState === 'active');
  return () => {
    stopped = true;
    unsubscribe();
    unsubscribeNavigation?.();
    unsubscribeSettings();
    appStateSubscription.remove();
    clearInterval(freshnessTimer);
    void activity.endSession(recordId);
  };
}

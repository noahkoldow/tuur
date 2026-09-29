import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { decideInterstitial } from '@tuur/shared';
import { getAds, subscribed, useEntitlementStore } from '../billing/entitlements';
import type { GuideRuntime, GuideUi } from '../guide/runtime';

const DAY = 24 * 3600_000;

/**
 * Interstitial policy (spec 6.2) applied to a running session: only in the gap between two stops (walking to the next
 * one, nothing playing), app in the foreground, capped per day and per gap, never for subscribers and never before the
 * UMP consent flow. The decision itself is the pure `decideInterstitial`.
 */
export function useInterstitials(runtime: GuideRuntime, ui: GuideUi) {
  const ent = useEntitlementStore((s) => s.entitlements);
  const loaded = useEntitlementStore((s) => s.loaded);
  const inFlight = useRef(false);
  const stopsSince = useRef(0);
  const shown = useRef<{ at: number[]; last?: number }>({ at: [] });
  const sub = subscribed({ entitlements: ent });
  const targetId = ui.target?.id;

  useEffect(
    () =>
      runtime.addCommandListener((c) => {
        if (c.type === 'visited') stopsSince.current += 1;
      }),
    [runtime],
  );

  useEffect(() => {
    // wait until the entitlements are known, so subscribers never see the consent form or an ad request
    if (!loaded || sub) return;
    const ads = getAds();
    void ads.gatherConsent().then(() => ads.preloadInterstitial());
  }, [sub, loaded]);

  useEffect(() => {
    if (!loaded || inFlight.current || AppState.currentState !== 'active') return;
    const now = Date.now();
    shown.current.at = shown.current.at.filter((t) => now - t < DAY);
    const ads = getAds();
    const d = decideInterstitial({
      now,
      lastShownAt: shown.current.last,
      shownToday: shown.current.at.length,
      stopsSinceLast: stopsSince.current,
      subscriber: sub,
      consent: ads.consent(),
      audioPlaying: ui.playing,
      betweenWaypoints: ui.phase === 'approaching' && targetId !== undefined,
    });
    if (!d.show) return;
    inFlight.current = true;
    ads
      .showInterstitial()
      .then((ok) => {
        if (!ok) return;
        shown.current.at.push(now);
        shown.current.last = now;
        stopsSince.current = 0;
        ads.preloadInterstitial();
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = false;
      });
    // depend on primitives: `ui.target` is a new object on every GPS fix
  }, [ui.phase, ui.playing, targetId, sub, loaded]);
}

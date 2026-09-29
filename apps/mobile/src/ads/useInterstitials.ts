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
  const stopsSince = useRef(0);
  const shown = useRef<{ at: number[]; last?: number }>({ at: [] });
  const sub = subscribed({ entitlements: ent });

  useEffect(
    () =>
      runtime.addCommandListener((c) => {
        if (c.type === 'visited') stopsSince.current += 1;
      }),
    [runtime],
  );

  useEffect(() => {
    if (sub) return;
    const ads = getAds();
    void ads.gatherConsent().then(() => ads.preloadInterstitial());
  }, [sub]);

  useEffect(() => {
    if (AppState.currentState !== 'active') return;
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
      betweenWaypoints: ui.phase === 'approaching' && Boolean(ui.target),
    });
    if (!d.show) return;
    void ads.showInterstitial().then((ok) => {
      if (!ok) return;
      shown.current.at.push(now);
      shown.current.last = now;
      stopsSince.current = 0;
      ads.preloadInterstitial();
    });
  }, [ui.phase, ui.playing, ui.target, sub]);
}

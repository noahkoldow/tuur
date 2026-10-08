import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { decideInterstitial } from '@tuur/shared';
import { getAds, subscribed, useEntitlementStore } from '../billing/entitlements';
import type { GuideRuntime, GuideUi } from '../guide/runtime';
import { readInterstitialFrequency, recordInterstitialShown } from './interstitialFrequency';

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
  const sub = subscribed({ entitlements: ent });
  const targetId = ui.target?.id;
  const textMode = runtime.getContentMode() === 'text';

  useEffect(
    () =>
      runtime.addCommandListener((c) => {
        if (c.type === 'visited') stopsSince.current += 1;
      }),
    [runtime],
  );

  useEffect(() => {
    // wait until the entitlements are known, so subscribers never see the consent form or an ad request
    if (!loaded || sub || !textMode) return;
    const ads = getAds();
    let active = true;
    void ads.gatherConsent().then(() => {
      if (active) ads.preloadInterstitial();
    });
    return () => {
      active = false;
    };
  }, [sub, loaded, textMode]);

  useEffect(() => {
    if (!loaded || !textMode || sub || inFlight.current || AppState.currentState !== 'active') return;
    const ads = getAds();
    const controller = new AbortController();
    inFlight.current = true;
    void (async () => {
      const now = Date.now();
      const frequency = await readInterstitialFrequency(now);
      if (
        !frequency ||
        controller.signal.aborted ||
        runtime.getContentMode() !== 'text' ||
        AppState.currentState !== 'active'
      )
        return;
      const d = decideInterstitial({
        now,
        ...frequency,
        stopsSinceLast: stopsSince.current,
        subscriber: sub,
        consent: ads.consent(),
        audioPlaying: ui.playing,
        betweenWaypoints: ui.phase === 'approaching' && targetId !== undefined,
      });
      if (!d.show) return;
      if (await ads.showInterstitial({ signal: controller.signal })) {
        await recordInterstitialShown();
        stopsSince.current = 0;
        if (!controller.signal.aborted) ads.preloadInterstitial();
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = false;
      });
    return () => controller.abort();
    // depend on primitives: `ui.target` is a new object on every GPS fix
  }, [runtime, ui.phase, ui.playing, targetId, sub, loaded, textMode]);
}

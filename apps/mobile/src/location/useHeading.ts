import { useCallback, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { config } from '../config';
import { useSettings } from '../state/settings';

/** Compass direction for the visible map only; GPS course still belongs to the guide. */
export function useHeading(enabled: boolean): number | undefined {
  const [heading, setHeading] = useState<number>();
  const simulator = useSettings((s) => s.simulator);
  const supported = Platform.OS === 'ios' || Platform.OS === 'android';
  const watching = enabled && supported && config.backend !== 'demo' && !simulator;

  useFocusEffect(
    useCallback(() => {
      setHeading(undefined);
      if (!watching) return;

      let disposed = false;
      let generation = 0;
      let active = false;
      let watcher: Location.LocationSubscription | undefined;
      const stop = () => {
        active = false;
        generation += 1;
        watcher?.remove();
        watcher = undefined;
      };
      const update = async (state: AppStateStatus) => {
        if (state !== 'active') {
          stop();
          setHeading(undefined);
          return;
        }
        if (active || disposed) return;
        active = true;
        const current = ++generation;
        const isCurrent = () => !disposed && generation === current;
        try {
          const permission = await Location.getForegroundPermissionsAsync();
          if (!isCurrent() || !permission.granted) return;
          const subscription = await Location.watchHeadingAsync(
            (reading) => {
              if (!isCurrent()) return;
              const valid = (value: number) => Number.isFinite(value) && value >= 0 && value <= 360;
              const degrees = valid(reading.trueHeading) ? reading.trueHeading : reading.magHeading;
              const calibrated = reading.accuracy >= 1 && reading.accuracy <= 3;
              setHeading(calibrated && valid(degrees) ? degrees % 360 : undefined);
            },
            () => {
              if (isCurrent()) setHeading(undefined);
            },
          );
          if (isCurrent()) watcher = subscription;
          else subscription.remove();
        } catch {
          if (isCurrent()) setHeading(undefined);
        }
      };

      const appState = AppState.addEventListener('change', (state) => void update(state));
      void update(AppState.currentState ?? 'active');
      return () => {
        disposed = true;
        stop();
        appState.remove();
      };
    }, [watching]),
  );

  return watching ? heading : undefined;
}

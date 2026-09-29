import { useSyncExternalStore } from 'react';
import { decodePolyline, type Interest, type LatLng, type Tour } from '@tuur/shared';
import { createAudioEngine } from '../audio/createEngine';
import { getBackend } from '../backend';
import { RealLocationSource } from '../location/real';
import { SimulatedLocationSource } from '../location/simulated';
import type { LocationSource } from '../location/types';
import { GuideRuntime } from './runtime';

export interface ActiveSession {
  runtime: GuideRuntime;
  tour: Tour;
  simulator?: SimulatedLocationSource;
  mode: 'tour';
  startedAt: number;
}

let active: ActiveSession | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function tourPath(tour: Tour): LatLng[] {
  return decodePolyline(tour.path).map(([lat, lng]) => ({ lat, lng }));
}

export interface StartOptions {
  tour: Tour;
  lang: string;
  interest?: Interest;
  simulate?: boolean;
  location?: LocationSource;
}

/** Starts (or replaces) the running tour; the session outlives screens so audio continues in the background. */
export async function startSession(o: StartOptions): Promise<ActiveSession> {
  await endSession();
  const runtime = new GuideRuntime({
    backend: getBackend(),
    audio: createAudioEngine(),
    lang: o.lang,
    ...(o.interest ? { interest: o.interest } : {}),
  });
  let simulator: SimulatedLocationSource | undefined;
  let source: LocationSource;
  if (o.simulate) {
    const path = tourPath(o.tour);
    const first = o.tour.stops[0]!;
    // start ~150 m before the first stop so the approach and the arrival narration can be observed
    const lead = { lat: first.location.lat - 0.0012, lng: first.location.lng - 0.0012 };
    simulator = new SimulatedLocationSource([lead, ...path]);
    source = simulator;
  } else {
    source = o.location ?? new RealLocationSource();
  }
  active = {
    runtime,
    tour: o.tour,
    ...(simulator ? { simulator } : {}),
    mode: 'tour',
    startedAt: Date.now(),
  };
  emit();
  await runtime.start(
    o.tour.stops.map((s) => ({ id: s.poiId, name: s.name, location: s.location })),
    source,
  );
  return active;
}

export async function endSession(): Promise<void> {
  const cur = active;
  active = undefined;
  emit();
  await cur?.runtime.dispose();
}

export function useActiveSession(): ActiveSession | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => active,
    () => active,
  );
}

export function getActiveSession() {
  return active;
}

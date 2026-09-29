import type { Fix } from '@tuur/shared';

export interface LocationSource {
  /** Starts delivering fixes; the returned function stops it. */
  subscribe(cb: (fix: Fix) => void): Promise<() => void>;
}

type Listener = (fix: Fix) => void;
const listeners = new Set<Listener>();
/** Bridges the background location task (module scope) into the running app. */
export const locationBus = {
  emit: (fix: Fix) => listeners.forEach((l) => l(fix)),
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

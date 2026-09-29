import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createBackend } from './create';
import type { Backend } from './types';

const Ctx = createContext<Backend | null>(null);

let base: Backend | undefined;
let singleton: Backend | undefined;

/** The network backend (Firebase or demo). Downloads use this one directly. */
export function getBaseBackend(): Backend {
  base ??= createBackend();
  return base;
}

/** App-wide backend: offline-first wrapper around the network backend (downloaded content works without network). */
export function getBackend(): Backend {
  if (!singleton) {
    const { getFileStore, getOfflineLibrary } = require('../offline') as typeof import('../offline');
    const { withOfflineFirst } =
      require('../offline/offlineBackend') as typeof import('../offline/offlineBackend');
    singleton = withOfflineFirst(getBaseBackend(), getOfflineLibrary(), getFileStore());
  }
  return singleton;
}

export function setBackendForTests(b: Backend | undefined) {
  base = b;
  singleton = b;
}

export function BackendProvider({ children, backend }: { children: ReactNode; backend?: Backend }) {
  const value = useMemo(() => backend ?? getBackend(), [backend]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBackend(): Backend {
  const b = useContext(Ctx);
  if (!b) throw new Error('BackendProvider missing');
  return b;
}

export * from './types';

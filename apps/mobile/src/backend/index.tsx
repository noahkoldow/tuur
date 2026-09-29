import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createBackend } from './create';
import type { Backend } from './types';

const Ctx = createContext<Backend | null>(null);

let singleton: Backend | undefined;

/** Lazily creates the configured backend; Firebase is only required when it is actually used (keeps web/demo light). */
export function getBackend(): Backend {
  singleton ??= createBackend();
  return singleton;
}

export function setBackendForTests(b: Backend | undefined) {
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

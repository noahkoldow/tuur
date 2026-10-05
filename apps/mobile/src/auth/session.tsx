import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useBackend, type UserInfo } from '../backend';
import { useSettings } from '../state/settings';
import { accountStep } from './policy';

const Context = createContext<{
  hydrated: boolean;
  user: UserInfo | null;
  updateUser: (user: UserInfo | null) => void;
  returnTo: Href | undefined;
  clearReturnTo: () => void;
}>({
  hydrated: false,
  user: null,
  updateUser: () => undefined,
  returnTo: undefined,
  clearReturnTo: () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = useBackend();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const onboarded = useSettings((s) => s.onboarded);
  const [returnTo, setReturnTo] = useState<Href>();
  const [state, setState] = useState<{ hydrated: boolean; user: UserInfo | null }>({
    hydrated: false,
    user: null,
  });
  useEffect(() => backend.auth.onChange((user) => setState({ hydrated: true, user })), [backend]);
  // Keep invitation/tour links while the protected navigator routes through sign-in and onboarding.
  useEffect(() => {
    if (accountStep(state.user) === 'ready' && onboarded) return;
    if (
      /^\/(?:home|profile|downloads|tours|tour|plan|fork|roam|play|business|invite|join|summary|paywall|redeem)(?:\/|$)/.test(
        pathname,
      )
    )
      setReturnTo((previous) => {
        const next = { pathname, params } as Href;
        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
      });
  }, [pathname, params, state.user, onboarded]);
  return (
    <Context.Provider
      value={{
        ...state,
        updateUser: (user) => setState({ hydrated: true, user }),
        returnTo,
        clearReturnTo: () => setReturnTo(undefined),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAuth() {
  const session = useContext(Context);
  return { ...session, step: accountStep(session.user) };
}

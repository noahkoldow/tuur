'use client';

import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fb } from './firebase';
import { useT } from './i18n';

export interface AuthState {
  /** Signed-in user; anonymous sessions never count as signed in to the portals. */
  user: User | null;
  /** True until the first auth state is known. */
  loading: boolean;
  /** Custom claim `admin` (set only with scripts/set-admin.mjs); the server re-checks it on every call. */
  isAdmin: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang } = useT();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      // id-token changes also fire when custom claims are refreshed
      onIdTokenChanged(fb().auth, async (u) => {
        const real = u && !u.isAnonymous ? u : null;
        const claims = real ? await real.getIdTokenResult().catch(() => undefined) : undefined;
        setUser(real);
        setIsAdmin(claims?.claims['admin'] === true);
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    if (typeof window !== 'undefined') fb().auth.languageCode = lang;
  }, [lang]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAdmin,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(fb().auth, email.trim(), password);
      },
      signUp: async (email, password) => {
        await createUserWithEmailAndPassword(fb().auth, email.trim(), password);
      },
      resetPassword: async (email) => {
        await sendPasswordResetEmail(fb().auth, email.trim());
      },
      signOut: async () => {
        await fbSignOut(fb().auth);
      },
    }),
    [user, loading, isAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

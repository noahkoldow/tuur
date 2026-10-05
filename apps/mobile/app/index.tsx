import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useSettings } from '../src/state/settings';
import { useAuth } from '../src/auth/session';

export default function Index() {
  const onboarded = useSettings((s) => s.onboarded);
  const { hydrated, step, returnTo, clearReturnTo } = useAuth();
  const router = useRouter();
  const redirected = useRef(false);
  useEffect(() => {
    if (!hydrated || redirected.current) return;
    redirected.current = true;
    if (step !== 'ready') return router.replace('/sign-in');
    if (!onboarded) return router.replace('/onboarding');
    router.replace(returnTo ?? '/home');
    clearReturnTo();
  }, [hydrated, step, onboarded, returnTo, clearReturnTo, router]);
  return null;
}

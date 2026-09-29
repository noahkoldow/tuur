import { Redirect } from 'expo-router';
import { useSettings } from '../src/state/settings';

export default function Index() {
  const onboarded = useSettings((s) => s.onboarded);
  return <Redirect href={onboarded ? '/home' : '/onboarding'} />;
}

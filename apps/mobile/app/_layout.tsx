import '../src/i18n';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { BackendProvider } from '../src/backend';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { useEntitlementSync } from '../src/billing/entitlements';
import { getOfflineLibrary } from '../src/offline';
import { setCrashReporting } from '../src/telemetry';
import { useSettings } from '../src/state/settings';
import { sys } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  useEntitlementSync();
  const hydrated = useSettings((s) => s.hydrated);
  // a font error must not hang the splash screen forever: the system font is an acceptable fallback
  const ready = (fontsLoaded || Boolean(fontError)) && hydrated;
  const analyticsConsent = useSettings((s) => s.analyticsConsent);

  useEffect(() => {
    if (hydrated) void setCrashReporting(analyticsConsent);
  }, [hydrated, analyticsConsent]);

  useEffect(() => {
    void getOfflineLibrary().load();
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <BackendProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: sys.background },
              headerTintColor: sys.accentText as string,
              // native push with full-width back swipe; sheets slide up and swipe down to dismiss
              animation: 'default',
              fullScreenGestureEnabled: true,
            }}
          >
            <Stack.Screen name="index" options={{ animation: 'fade' }} />
            <Stack.Screen name="onboarding/index" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="play" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="summary/[id]"
              options={{ animation: 'fade_from_bottom', gestureEnabled: false }}
            />
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
            <Stack.Screen name="redeem" options={{ presentation: 'modal' }} />
            <Stack.Screen name="join/[token]" options={{ presentation: 'modal' }} />
          </Stack>
        </BackendProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

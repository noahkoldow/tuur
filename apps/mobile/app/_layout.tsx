import '../src/i18n';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { BackendProvider } from '../src/backend';
import { AuthProvider, useAuth } from '../src/auth/session';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { useEntitlementSync } from '../src/billing/entitlements';
import { getOfflineLibrary } from '../src/offline';
import { initializeTourLiveActivities } from '../src/liveActivity/service';
import { initializeSessionRecovery } from '../src/guide/session';
import { setCrashReporting } from '../src/telemetry';
import { useSettings } from '../src/state/settings';
import { sys } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <BackendProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </BackendProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  useEntitlementSync();
  const hydrated = useSettings((s) => s.hydrated);
  const onboarded = useSettings((s) => s.onboarded);
  const auth = useAuth();
  // a font error must not hang the splash screen forever: the system font is an acceptable fallback
  const ready = (fontsLoaded || Boolean(fontError)) && hydrated && auth.hydrated;
  const analyticsConsent = useSettings((s) => s.analyticsConsent);

  useEffect(() => {
    if (hydrated) void setCrashReporting(analyticsConsent);
  }, [hydrated, analyticsConsent]);

  useEffect(() => {
    void getOfflineLibrary()
      .load()
      .catch(() => undefined);
    initializeTourLiveActivities();
    return initializeSessionRecovery();
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: sys.background },
          headerTintColor: sys.accentText as string,
          headerTitleStyle: { color: sys.label as string },
          // native push with full-width back swipe; sheets slide up and swipe down to dismiss
          animation: 'default',
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="legal/[doc]" />
        <Stack.Protected guard={auth.step !== 'ready'}>
          <Stack.Screen name="sign-in" options={{ animation: 'fade', gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={auth.step === 'ready' && !onboarded}>
          <Stack.Screen name="onboarding/index" options={{ animation: 'fade', gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={auth.step === 'ready' && onboarded}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="tours" />
          <Stack.Screen name="tour/[id]" />
          <Stack.Screen name="plan" />
          <Stack.Screen name="fork" />
          <Stack.Screen name="roam" />
          <Stack.Screen name="business" />
          <Stack.Screen name="invite/[token]" />
          {/* minimizes with the chevron, so the gesture is a swipe down, not a back swipe from the edge */}
          <Stack.Screen
            name="play"
            options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }}
          />
          <Stack.Screen
            name="summary/[id]"
            options={{ animation: 'fade_from_bottom', gestureEnabled: false }}
          />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          <Stack.Screen name="redeem" options={{ presentation: 'modal' }} />
          <Stack.Screen name="join/[token]" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

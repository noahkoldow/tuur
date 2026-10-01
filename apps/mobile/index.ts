import { Platform } from 'react-native';

// EXPO_PUBLIC_EXPO_GO: UI preview in Expo Go, where these native modules are stubbed out (see metro.config.js).
if (Platform.OS !== 'web' && process.env.EXPO_PUBLIC_EXPO_GO !== '1') {
  const { getApp } = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
  const {
    initializeAppCheck,
    ReactNativeFirebaseAppCheckProvider,
  } = require('@react-native-firebase/app-check') as typeof import('@react-native-firebase/app-check');
  const appCheckProvider = new ReactNativeFirebaseAppCheckProvider();
  appCheckProvider.configure({
    apple: { provider: __DEV__ ? 'debug' : 'appAttest' },
    android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
  });
  initializeAppCheck(getApp(), { provider: appCheckProvider, isTokenAutoRefreshEnabled: true });

  // Native only: background location task (must be defined at module scope) and the lock-screen playback service.
  require('./src/location/backgroundTask');
  const TrackPlayer = require('react-native-track-player')
    .default as typeof import('react-native-track-player').default;
  TrackPlayer.registerPlaybackService(() => require('./src/audio/playbackService').default);
}

require('expo-router/entry');

import type { ConfigContext, ExpoConfig } from 'expo/config';

const brand = '../../assets/brand/app';
const expoGoPreview = process.env.EXPO_PUBLIC_EXPO_GO === '1';
const betaFirebase =
  process.env.EXPO_PUBLIC_BACKEND === 'firebase' &&
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID === 'tuur-beta-noehxpo';

/** Native Firebase config files are provided per environment (never committed), see docs/SETUP.md. */
const googleServicesIos = process.env.GOOGLE_SERVICES_INFO_PLIST ?? './GoogleService-Info.plist';
const googleServicesAndroid = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'tuur',
  slug: 'tuur',
  owner: 'noehxpo',
  extra: {
    ...config.extra,
    eas: { projectId: '2d786517-671d-464c-aafe-8893f358531e' },
  },
  scheme: 'tuur',
  version: '0.1.0',
  // Publish the Expo Go preview without enabling OTA delivery for native releases.
  ...(expoGoPreview ? { updates: { url: 'https://u.expo.dev/2d786517-671d-464c-aafe-8893f358531e' } } : {}),
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: `${brand}/icon-ios-1024.png`,
  ios: {
    ...(expoGoPreview ? { runtimeVersion: { policy: 'appVersion' as const } } : {}),
    bundleIdentifier: 'com.tuurapp',
    appleTeamId: '4GXK973R2W',
    supportsTablet: false,
    usesAppleSignIn: true,
    entitlements: {
      // Firebase App Check rejects attestations from Apple's sandbox environment.
      'com.apple.developer.devicecheck.appattest-environment': 'production',
    },
    associatedDomains: ['applinks:tuur.app', ...(betaFirebase ? ['applinks:tuur-beta-noehxpo.web.app'] : [])],
    ...(googleServicesIos ? { googleServicesFile: googleServicesIos } : {}),
    infoPlist: {
      NSSupportsLiveActivities: true,
      UIBackgroundModes: ['audio', 'location'],
      NSLocationWhenInUseUsageDescription:
        'tuur uses your location to guide you along paths and tell you the right story at each place. To calculate directions, your current location and destination are sent to our servers and routing provider without being stored.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'tuur keeps navigation and your audio tour going while the screen is off. To calculate directions, your current location and destination are sent to our servers and routing provider without being stored. Nearby content uses a coarse map square; redeeming an offer sends a one-time position.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'app.tuur.guide',
    blockedPermissions: ['android.permission.WRITE_EXTERNAL_STORAGE'],
    adaptiveIcon: {
      foregroundImage: `${brand}/adaptive-icon-foreground.png`,
      monochromeImage: `${brand}/adaptive-icon-monochrome.png`,
      backgroundColor: '#ED0516',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'POST_NOTIFICATIONS',
      'WAKE_LOCK',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'tuur.app', pathPrefix: '/invite' },
          { scheme: 'https', host: 'tuur.app', pathPrefix: '/join' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    ...(googleServicesAndroid ? { googleServicesFile: googleServicesAndroid } : {}),
  },
  web: { favicon: `${brand}/favicon-48.png`, bundler: 'metro' },
  plugins: [
    'expo-router',
    // Live Activities use the built-in target; widgets[] is for home-screen widgets only.
    ['expo-widgets', { bundleIdentifier: 'com.tuurapp.widgets', groupIdentifier: 'group.com.tuurapp' }],
    'expo-font',
    [
      'expo-media-library',
      {
        photosPermission:
          'Allow tuur to find photos taken during your activity for an optional share-card collage.',
        savePhotosPermission: false,
        granularPermissions: ['photo'],
        isAccessMediaLocationEnabled: false,
        preventAutomaticLimitedAccessAlert: true,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: `${brand}/splash-mark.png`,
        backgroundColor: '#FFFFFF',
        imageWidth: 160,
        dark: { image: `${brand}/splash-mark.png`, backgroundColor: '#000000' },
      },
    ],
    ['expo-localization', { supportedLocales: { ios: ['de', 'en'], android: ['de', 'en'] } }],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'tuur keeps navigation and your audio tour going while the screen is off. To calculate directions, your current location and destination are sent to our servers and routing provider without being stored. Nearby content uses a coarse map square; redeeming an offer sends a one-time position.',
        locationWhenInUsePermission:
          'tuur uses your location to guide you along paths and tell you the right story at each place. To calculate directions, your current location and destination are sent to our servers and routing provider without being stored.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    '@maplibre/maplibre-react-native',
    ['@react-native-firebase/app', { ios: { disableSPM: true } }],
    '@react-native-firebase/auth',
    '@react-native-firebase/app-check',
    '@react-native-firebase/crashlytics',
    [
      'expo-build-properties',
      { ios: { useFrameworks: 'dynamic', deploymentTarget: '16.4' }, android: { minSdkVersion: 26 } },
    ],
    'expo-apple-authentication',
    [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME ?? 'com.googleusercontent.apps.tuur' },
    ],
    [
      'react-native-google-mobile-ads',
      {
        // Google's public test app IDs are the default; real IDs come from the environment at build time.
        androidAppId: process.env.ADMOB_ANDROID_APP_ID ?? 'ca-app-pub-3940256099942544~3347511713',
        iosAppId: process.env.ADMOB_IOS_APP_ID ?? 'ca-app-pub-3940256099942544~1458002511',
        // the SDK must not start (and measure) before the UMP consent flow has run
        delayAppMeasurementInit: true,
        userTrackingUsageDescription:
          'tuur uses this identifier to show ads that fit you. You can also use tuur with non-personalized ads.',
      },
    ],
    'expo-dev-client',
  ],
  experiments: { typedRoutes: true },
});

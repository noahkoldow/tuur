import type { ConfigContext, ExpoConfig } from 'expo/config';

const brand = '../../assets/brand/app';

/** Native Firebase config files are provided per environment (never committed), see docs/SETUP.md. */
const googleServicesIos = process.env.GOOGLE_SERVICES_INFO_PLIST;
const googleServicesAndroid = process.env.GOOGLE_SERVICES_JSON;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'tuur',
  slug: 'tuur',
  scheme: 'tuur',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: `${brand}/icon-ios-1024.png`,
  ios: {
    bundleIdentifier: 'app.tuur.guide',
    supportsTablet: false,
    usesAppleSignIn: true,
    associatedDomains: ['applinks:tuur.app'],
    ...(googleServicesIos ? { googleServicesFile: googleServicesIos } : {}),
    infoPlist: {
      UIBackgroundModes: ['audio', 'location'],
      NSLocationWhenInUseUsageDescription:
        'tuur uses your location on your device to tell you the right story when you arrive at a place.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'tuur keeps your audio tour going while the screen is off. Your exact position never leaves your device.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'app.tuur.guide',
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
        data: [{ scheme: 'https', host: 'tuur.app', pathPrefix: '/invite' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    ...(googleServicesAndroid ? { googleServicesFile: googleServicesAndroid } : {}),
  },
  web: { favicon: `${brand}/favicon-48.png`, bundler: 'metro' },
  plugins: [
    'expo-router',
    'expo-font',
    [
      'expo-splash-screen',
      { image: `${brand}/splash-mark.png`, backgroundColor: '#FFFFFF', imageWidth: 160 },
    ],
    ['expo-localization', { supportedLocales: { ios: ['de', 'en'], android: ['de', 'en'] } }],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: 'tuur keeps your audio tour going while the screen is off.',
        locationWhenInUsePermission:
          'tuur uses your location to tell you the right story at the right place.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    '@maplibre/maplibre-react-native',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/app-check',
    '@react-native-firebase/crashlytics',
    [
      'expo-build-properties',
      { ios: { useFrameworks: 'static', deploymentTarget: '16.4' }, android: { minSdkVersion: 26 } },
    ],
    'expo-apple-authentication',
    [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME ?? 'com.googleusercontent.apps.REPLACE_ME' },
    ],
    [
      'react-native-google-mobile-ads',
      {
        // Google's public test app IDs are the default; real IDs come from the environment at build time.
        androidAppId: process.env.ADMOB_ANDROID_APP_ID ?? 'ca-app-pub-3940256099942544~3347511713',
        iosAppId: process.env.ADMOB_IOS_APP_ID ?? 'ca-app-pub-3940256099942544~1458002511',
        userTrackingUsageDescription:
          'tuur uses this identifier to show ads that fit you. You can also use tuur with non-personalized ads.',
      },
    ],
    'expo-dev-client',
  ],
  experiments: { typedRoutes: true },
});

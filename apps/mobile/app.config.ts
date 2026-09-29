import type { ExpoConfig } from 'expo/config';

const brand = '../../assets/brand/app';

const config: ExpoConfig = {
  name: 'tuur',
  slug: 'tuur',
  scheme: 'tuur',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: `${brand}/icon-ios-1024.png`,
  ios: { bundleIdentifier: 'app.tuur.guide', supportsTablet: false },
  android: {
    package: 'app.tuur.guide',
    adaptiveIcon: {
      foregroundImage: `${brand}/adaptive-icon-foreground.png`,
      monochromeImage: `${brand}/adaptive-icon-monochrome.png`,
      backgroundColor: '#ED0516',
    },
  },
  web: { favicon: `${brand}/favicon-48.png`, bundler: 'metro' },
  plugins: [
    'expo-router',
    'expo-font',
    [
      'expo-splash-screen',
      { image: `${brand}/splash-mark.png`, backgroundColor: '#FFFFFF', imageWidth: 160 },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;

const { getDefaultConfig } = require('expo/metro-config');

// Expo detects pnpm/Turborepo monorepos automatically; assets live outside the app dir.
const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), require('path').resolve(__dirname, '../../assets')];
module.exports = config;

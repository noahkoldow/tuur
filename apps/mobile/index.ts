import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  // Native only: background location task (must be defined at module scope) and the lock-screen playback service.
  require('./src/location/backgroundTask');
  const TrackPlayer = require('react-native-track-player')
    .default as typeof import('react-native-track-player').default;
  TrackPlayer.registerPlaybackService(() => require('./src/audio/playbackService').default);
}

require('expo-router/entry');

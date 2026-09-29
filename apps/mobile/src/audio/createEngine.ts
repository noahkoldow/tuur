import { config } from '../config';
import type { AudioEngine } from './types';
import { SimulatedAudioEngine } from './simulatedEngine';
import { TrackPlayerEngine } from './trackPlayerEngine';

/** Native: real background audio via react-native-track-player (demo backend uses silent simulated playback). */
export function createAudioEngine(): AudioEngine {
  return config.backend === 'demo' ? new SimulatedAudioEngine() : new TrackPlayerEngine();
}

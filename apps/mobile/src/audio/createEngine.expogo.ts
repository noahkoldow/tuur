import * as Speech from 'expo-speech';
import { config } from '../config';
import { ExpoAudioEngine } from './expoAudioEngine';
import { SimulatedAudioEngine } from './simulatedEngine';
import type { AudioEngine } from './types';

export function createAudioEngine(): AudioEngine {
  return config.backend === 'firebase'
    ? new ExpoAudioEngine()
    : new SimulatedAudioEngine(undefined, {
        speak: (text, lang) => {
          void Speech.stop();
          Speech.speak(text, { language: lang ?? 'de', rate: 0.95 });
        },
        cancelSpeech: () => {
          void Speech.stop();
        },
      });
}

import type { AudioEngine } from './types';
import { SimulatedAudioEngine } from './simulatedEngine';
import { ExpoAudioEngine } from './expoAudioEngine';
import { config } from '../config';

/** Web preview: timer-based playback, speaking the paragraph text with the browser's speech synthesis. */
export function createAudioEngine(): AudioEngine {
  if (config.backend === 'firebase') return new ExpoAudioEngine();
  const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return new SimulatedAudioEngine(
    undefined,
    hasSpeech
      ? {
          speak: (text, lang) => {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = lang ?? 'de';
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
          },
          cancelSpeech: () => window.speechSynthesis.cancel(),
        }
      : {},
  );
}

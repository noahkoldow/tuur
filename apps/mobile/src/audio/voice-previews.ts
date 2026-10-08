import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { DEFAULT_VOICE_ID } from '@tuur/shared';
import { createVoicePreviewPlayer } from './voice-preview-player';

const clips = {
  mara: {
    de: require('../../assets/voice-previews/mara-de.mp3'),
    en: require('../../assets/voice-previews/mara-en.mp3'),
  },
  jonas: {
    de: require('../../assets/voice-previews/jonas-de.mp3'),
    en: require('../../assets/voice-previews/jonas-en.mp3'),
  },
  lina: {
    de: require('../../assets/voice-previews/lina-de.mp3'),
    en: require('../../assets/voice-previews/lina-en.mp3'),
  },
};
export type PreviewVoice = keyof typeof clips;
export function previewVoice(id: string): PreviewVoice {
  return Object.prototype.hasOwnProperty.call(clips, id)
    ? (id as PreviewVoice)
    : (DEFAULT_VOICE_ID as PreviewVoice);
}
export function voicePreview(voice: string, lang: string) {
  return createVoicePreviewPlayer({
    init: () =>
      setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'doNotMix',
      }),
    create: () =>
      createAudioPlayer(clips[previewVoice(voice)][lang.startsWith('de') ? 'de' : 'en'], {
        updateInterval: 200,
        // expo-audio otherwise deactivates the shared iOS session after a delayed pause/end,
        // which can interrupt a TrackPlayer tour that has just resumed.
        keepAudioSessionActive: true,
      }),
  });
}

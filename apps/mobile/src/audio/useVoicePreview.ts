import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { DEFAULT_VOICE_CAST, voiceDisplayName } from '@tuur/shared';
import { useSettings } from '../state/settings';
import { previewVoice, voicePreview, type PreviewVoice } from './voice-previews';

export interface VoicePreviewOptions {
  active?: boolean;
  autoPlay?: boolean;
  lang?: string;
  beforePlay?: () => void;
}

/** Shared bundled-audio controls. Completion unlocks Continue; the caller alone decides when to advance. */
export function useVoicePreview({
  active = true,
  autoPlay = false,
  lang,
  beforePlay,
}: VoicePreviewOptions = {}) {
  const savedVoice = useSettings((state) => state.voiceId);
  const savedLanguage = useSettings((state) => state.language);
  const voice = previewVoice(savedVoice);
  const language = (lang ?? savedLanguage).toLowerCase().startsWith('de') ? 'de' : 'en';
  const player = useMemo(() => voicePreview(voice, language), [voice, language]);
  const status = useSyncExternalStore(player.subscribe, player.getState, player.getState);
  const [outcome, setOutcome] = useState({ completed: false, error: false });
  const autoAttempted = useRef(false);
  const selectedRequest = useRef<{ voice: PreviewVoice; language: string } | undefined>(undefined);
  const before = useRef(beforePlay);
  const mounted = useRef(true);
  useEffect(() => {
    before.current = beforePlay;
  }, [beforePlay]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const recordError = useCallback(() => {
    if (mounted.current) setOutcome((previous) => (previous.error ? previous : { ...previous, error: true }));
  }, []);
  // Record terminal events immediately, even when a voice change follows before React's next render.
  useEffect(() => {
    const record = () => {
      const phase = player.getState().phase;
      if (phase === 'ended')
        setOutcome((previous) => (previous.completed ? previous : { ...previous, completed: true }));
      else if (phase === 'error') recordError();
    };
    const off = player.subscribe(record);
    record();
    return () => {
      off();
      player.stop();
    };
  }, [player, recordError]);

  useEffect(() => {
    if (!active) {
      selectedRequest.current = undefined;
      player.stop();
    }
    const off = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      autoAttempted.current = true;
      selectedRequest.current = undefined;
      if (state === 'background') player.stop();
      else player.pause();
    });
    return () => off.remove();
  }, [active, player]);

  const start = useCallback(
    (replay = false) => {
      if (!active || AppState.currentState !== 'active') return;
      autoAttempted.current = true;
      selectedRequest.current = undefined;
      try {
        before.current?.();
        void (replay ? player.replay() : player.play()).catch(recordError);
      } catch {
        recordError();
      }
    },
    [active, player, recordError],
  );
  useEffect(() => {
    if (!active) return;
    const selected = selectedRequest.current;
    if (selected?.voice === voice && selected.language === language) start();
    else if (autoPlay && !autoAttempted.current) start();
  }, [active, autoPlay, voice, language, start]);

  const play = useCallback(() => start(), [start]);
  const replay = useCallback(() => start(true), [start]);
  const pause = useCallback(() => {
    autoAttempted.current = true;
    selectedRequest.current = undefined;
    player.pause();
  }, [player]);
  const stop = useCallback(() => {
    autoAttempted.current = true;
    selectedRequest.current = undefined;
    player.stop();
  }, [player]);
  const selectVoice = useCallback(
    (selection: PreviewVoice) => {
      if (!active || AppState.currentState !== 'active') return;
      const next = previewVoice(selection);
      autoAttempted.current = true;
      player.stop();
      selectedRequest.current = { voice: next, language };
      useSettings.getState().set({ voiceId: next });
      if (next === voice) start();
    },
    [active, player, voice, language, start],
  );

  const completed = outcome.completed || status.phase === 'ended';
  const progress =
    Number.isFinite(status.position) && Number.isFinite(status.duration) && status.duration > 0
      ? Math.max(0, Math.min(1, status.position / status.duration))
      : 0;
  return {
    voice,
    voiceName: voiceDisplayName(
      DEFAULT_VOICE_CAST.find((persona) => persona.id === voice)!,
      language,
    ),
    language,
    status,
    playing: status.phase === 'playing',
    progress,
    completed,
    continueUnlocked: completed || outcome.error || status.phase === 'error',
    play,
    pause,
    replay,
    stop,
    selectVoice,
  };
}

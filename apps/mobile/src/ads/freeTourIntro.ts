import { create } from 'zustand';

export const FREE_TOUR_INTRO_SKIP_DELAY_MS = 15_000;

/** Starts when the fullscreen intro is visible, independently of audio playback or voice changes. */
export function freeTourIntroCountdown(startedAt: number | null, now: number) {
  const elapsed = startedAt === null ? 0 : Math.max(0, now - startedAt);
  const remainingMs = Math.max(0, FREE_TOUR_INTRO_SKIP_DELAY_MS - elapsed);
  return {
    remainingSeconds: Math.ceil(remainingMs / 1000),
    progress: Math.min(1, elapsed / FREE_TOUR_INTRO_SKIP_DELAY_MS),
    unlocked: startedAt !== null && remainingMs === 0,
  };
}

interface IntroRequest {
  id: number;
  lang: string;
  resolve: (completed: boolean) => void;
}
export const useFreeTourIntro = create<{ request?: IntroRequest }>(() => ({}));
let nextId = 0;

/** Called for a new free tour, never recovery. A second request cancels the older start. */
export function runFreeTourIntro(lang: string): Promise<boolean> {
  useFreeTourIntro.getState().request?.resolve(false);
  return new Promise((resolve) => {
    const id = ++nextId;
    let settled = false;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      if (useFreeTourIntro.getState().request?.id === id) useFreeTourIntro.setState({ request: undefined });
      resolve(completed);
    };
    useFreeTourIntro.setState({ request: { id, lang, resolve: finish } });
  });
}

export function cancelFreeTourIntro() {
  useFreeTourIntro.getState().request?.resolve(false);
}

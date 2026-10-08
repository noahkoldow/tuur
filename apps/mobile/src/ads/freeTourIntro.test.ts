import { afterEach, describe, expect, it } from 'vitest';
import {
  cancelFreeTourIntro,
  freeTourIntroCountdown,
  runFreeTourIntro,
  useFreeTourIntro,
} from './freeTourIntro';

describe('free tour skip countdown', () => {
  it('stays locked until the intro has actually appeared', () => {
    expect(freeTourIntroCountdown(null, 60_000)).toEqual({
      remainingSeconds: 15,
      progress: 0,
      unlocked: false,
    });
  });
  it('only unlocks after all 15 seconds have elapsed', () => {
    expect(freeTourIntroCountdown(1_000, 8_500)).toEqual({
      remainingSeconds: 8,
      progress: 0.5,
      unlocked: false,
    });
    expect(freeTourIntroCountdown(1_000, 15_999).unlocked).toBe(false);
    expect(freeTourIntroCountdown(1_000, 16_000)).toEqual({
      remainingSeconds: 0,
      progress: 1,
      unlocked: true,
    });
    expect(freeTourIntroCountdown(1_000, 60_000).progress).toBe(1);
  });
  it('gives each newly opened intro its own full countdown', () => {
    expect(freeTourIntroCountdown(1_000, 16_000).unlocked).toBe(true);
    expect(freeTourIntroCountdown(16_000, 16_000)).toEqual({
      remainingSeconds: 15,
      progress: 0,
      unlocked: false,
    });
    expect(freeTourIntroCountdown(16_000, 15_999).progress).toBe(0);
  });
});

afterEach(cancelFreeTourIntro);
describe('free tour introduction handoff', () => {
  it('keeps the tour start pending until the introduction and ad finish', async () => {
    const result = runFreeTourIntro('de');
    let complete = false;
    void result.then(() => {
      complete = true;
    });
    await Promise.resolve();
    expect(complete).toBe(false);
    useFreeTourIntro.getState().request!.resolve(true);
    await expect(result).resolves.toBe(true);
    expect(useFreeTourIntro.getState().request).toBeUndefined();
  });
  it('cancels the previous start without allowing its late completion to close a newer intro', async () => {
    const older = runFreeTourIntro('de');
    const oldRequest = useFreeTourIntro.getState().request!;
    const newer = runFreeTourIntro('en');
    await expect(older).resolves.toBe(false);
    oldRequest.resolve(true);
    expect(useFreeTourIntro.getState().request?.lang).toBe('en');
    cancelFreeTourIntro();
    await expect(newer).resolves.toBe(false);
  });
});

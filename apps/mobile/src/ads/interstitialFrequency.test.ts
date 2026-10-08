import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
const DAY = 24 * 3600_000;

beforeEach(() => {
  vi.resetModules();
  storage.getItem.mockReset().mockResolvedValue(null);
  storage.setItem.mockReset().mockResolvedValue(undefined);
});

describe('shared interstitial frequency', () => {
  it('includes start ads in the same persisted history after an app restart', async () => {
    const now = 2 * DAY;
    const first = await import('./interstitialFrequency');
    await first.recordInterstitialShown(now - 1_000);
    const serialized = storage.setItem.mock.calls[0]![1];
    vi.resetModules();
    storage.getItem.mockResolvedValue(serialized);
    const restarted = await import('./interstitialFrequency');
    await expect(restarted.readInterstitialFrequency(now)).resolves.toEqual({
      shownToday: 1,
      lastShownAt: now - 1_000,
    });
  });

  it('serializes overlapping records without losing either ad and expires the rolling day', async () => {
    const now = 3 * DAY;
    storage.getItem.mockResolvedValue(JSON.stringify([now - DAY - 1, now - 2_000]));
    const history = await import('./interstitialFrequency');
    await Promise.all([history.recordInterstitialShown(now - 1_000), history.recordInterstitialShown(now)]);
    await expect(history.readInterstitialFrequency(now)).resolves.toEqual({
      shownToday: 3,
      lastShownAt: now,
    });
    await expect(history.readInterstitialFrequency(now + DAY)).resolves.toEqual({
      shownToday: 0,
      lastShownAt: undefined,
    });
  });

  it('does not treat unreadable storage as an empty daily history', async () => {
    storage.getItem.mockRejectedValue(new Error('storage unavailable'));
    const history = await import('./interstitialFrequency');
    await expect(history.readInterstitialFrequency()).resolves.toBeUndefined();
  });
});

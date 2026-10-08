import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@tuur/interstitial-frequency/v1';
const DAY = 24 * 3600_000;
let shown: number[] = [];
let hydrated = false;
let loading: Promise<boolean> | undefined;
let writing = Promise.resolve();

async function hydrate(): Promise<boolean> {
  if (hydrated) return true;
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const value: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(value) || !value.every((at) => typeof at === 'number' && Number.isFinite(at)))
        return false;
      shown = [...value, ...shown];
      hydrated = true;
      return true;
    } catch {
      // An unreadable history must not silently reset the daily limit.
      return false;
    } finally {
      loading = undefined;
    }
  })();
  return loading;
}

/** Shared by tour-start ads and between-stop ads; survives changing tours and app restarts. */
export function recordInterstitialShown(at = Date.now()): Promise<void> {
  if (!Number.isFinite(at)) return Promise.resolve();
  writing = writing.then(async () => {
    const loaded = await hydrate();
    shown = [...shown.filter((time) => time > at - DAY && time <= at), at];
    if (loaded) {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(shown));
      } catch {
        // Keep the in-memory limit even when device storage is temporarily unavailable.
      }
    }
  });
  return writing;
}

/** Undefined means storage is unavailable, so optional between-stop ads should wait. */
export async function readInterstitialFrequency(now = Date.now()) {
  await writing;
  if (!(await hydrate())) return undefined;
  const recent = shown.filter((at) => at > now - DAY && at <= now);
  return {
    shownToday: recent.length,
    lastShownAt: recent.length ? Math.max(...recent) : undefined,
  };
}

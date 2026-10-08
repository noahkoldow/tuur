import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplePlace } from '../../modules/tuur-apple-places';
import type { PauseFilter } from '../guide/pauseDestination';

const controls = vi.hoisted(() => ({
  available: true,
  search: vi.fn(),
  cancel: vi.fn(async () => undefined),
  states: [] as unknown[],
  cursor: 0,
  dependencies: undefined as unknown[] | undefined,
  cleanup: undefined as (() => void) | undefined,
}));
vi.mock('../../modules/tuur-apple-places', () => ({
  get isApplePlacesAvailable() {
    return controls.available;
  },
  searchApplePlaces: controls.search,
  cancelApplePlacesSearch: controls.cancel,
}));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
    if (controls.dependencies?.every((value, index) => Object.is(value, deps[index]))) return;
    controls.cleanup?.();
    controls.dependencies = deps;
    controls.cleanup = effect();
  },
  useState: (initial: unknown) => {
    const index = controls.cursor++;
    if (!(index in controls.states)) controls.states[index] = initial;
    return [
      controls.states[index],
      (value: unknown) => {
        controls.states[index] = typeof value === 'function' ? value(controls.states[index]) : value;
      },
    ];
  },
}));
import { useApplePausePlaces } from './use-apple-pause-places';

const center = { lat: 48.8566, lng: 2.3522 };
const cafe: ApplePlace = {
  id: 'apple-cafe',
  name: 'Cafe',
  latitude: center.lat,
  longitude: center.lng,
  category: 'coffee',
};
function Reader(position: typeof center | null = center, filter: PauseFilter = 'all') {
  controls.cursor = 0;
  return useApplePausePlaces(position, filter);
}
async function flush() {
  for (let count = 0; count < 5; count++) await Promise.resolve();
}
beforeEach(() => {
  controls.cleanup?.();
  controls.cleanup = undefined;
  controls.dependencies = undefined;
  controls.states = [];
  controls.cursor = 0;
  controls.available = true;
  controls.cancel.mockClear();
  controls.search.mockReset().mockResolvedValue([cafe]);
  vi.useFakeTimers();
});
afterEach(() => {
  controls.cleanup?.();
  controls.cleanup = undefined;
  vi.useRealTimers();
});

describe('Apple pause search lifecycle', () => {
  it('does not search without a position and clears results when the sheet closes', async () => {
    Reader(null);
    await flush();
    expect(controls.search).not.toHaveBeenCalled();
    Reader();
    await flush();
    expect(Reader().places).toEqual([cafe]);
    Reader(null);
    expect(Reader(null).places).toEqual([]);
    expect(controls.cancel).toHaveBeenCalledOnce();
  });

  it('cancels old category searches and ignores late responses', async () => {
    let finishOld!: (places: ApplePlace[]) => void;
    controls.search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    Reader(center, 'coffee');
    controls.search.mockResolvedValueOnce([{ ...cafe, id: 'park', category: 'park' }]);
    Reader(center, 'rest');
    await flush();
    finishOld([cafe]);
    await flush();
    expect(Reader(center, 'rest').places.map((place) => place.id)).toEqual(['park']);
    expect(controls.search).toHaveBeenLastCalledWith({
      latitude: center.lat,
      longitude: center.lng,
      category: 'park',
      radiusMeters: 1500,
    });
    expect(controls.cancel).toHaveBeenCalledOnce();
  });

  it('retains the current results after a failed refresh and allows recovery', async () => {
    Reader();
    await flush();
    Reader().reload();
    controls.search.mockRejectedValueOnce(new Error('temporarily unavailable'));
    Reader();
    await flush();
    expect(Reader()).toMatchObject({ error: 'error', places: [cafe], loading: false });
    Reader().reload();
    Reader();
    await flush();
    expect(Reader()).toMatchObject({ error: null, ready: true, places: [cafe] });
  });

  it('reports older binaries without invoking native search', async () => {
    controls.available = false;
    Reader();
    await flush();
    expect(Reader()).toMatchObject({ error: 'unavailable', ready: false, places: [] });
    expect(controls.search).not.toHaveBeenCalled();
  });

  it('times out hanging searches and ignores results arriving after cancellation', async () => {
    let finish!: (places: ApplePlace[]) => void;
    controls.search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    Reader();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(Reader()).toMatchObject({ error: 'error', loading: false });
    expect(controls.cancel).toHaveBeenCalledOnce();
    finish([cafe]);
    await flush();
    expect(Reader().places).toEqual([]);
  });
});

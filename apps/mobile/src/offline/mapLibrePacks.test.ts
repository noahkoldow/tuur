import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ createPack: vi.fn(), getPacks: vi.fn(), deletePack: vi.fn() }));
vi.mock('@maplibre/maplibre-react-native', () => ({ OfflineManager: native }));
import { MapLibreMapPackManager } from './mapLibrePacks';

const bounds = { west: 13, south: 52, east: 14, north: 53 };
const styleUrl = 'https://maps.example.net/offline-authorized-style.json';
describe('native offline maps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    native.getPacks.mockResolvedValue([]);
    native.deletePack.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('rejects when native creation fails before callbacks attach', async () => {
    native.createPack.mockRejectedValue(new Error('native creation failed'));
    await expect(new MapLibreMapPackManager(styleUrl).create('tour', bounds, vi.fn())).rejects.toThrow(
      'native creation failed',
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a stalled native pack and removes it', async () => {
    const pack = { id: 'pack', pause: vi.fn().mockResolvedValue(undefined) };
    native.createPack.mockResolvedValue(pack);
    const signal = { cancelled: false };
    const operation = new MapLibreMapPackManager(styleUrl).create('tour', bounds, vi.fn(), { signal });
    const rejected = expect(operation).rejects.toMatchObject({ code: 'cancelled' });
    await vi.advanceTimersByTimeAsync(0);
    signal.cancelled = true;
    await vi.advanceTimersByTimeAsync(200);
    await rejected;
    expect(pack.pause).toHaveBeenCalledOnce();
    expect(native.deletePack).toHaveBeenCalledWith('pack');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out native creation and discards a pack that arrives afterwards', async () => {
    const pack = { id: 'late', pause: vi.fn().mockResolvedValue(undefined) };
    let finishCreation!: (value: typeof pack) => void;
    native.createPack.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCreation = resolve;
        }),
    );
    const operation = new MapLibreMapPackManager(styleUrl).create('tour', bounds, vi.fn(), {
      timeoutMs: 1000,
    });
    const rejected = expect(operation).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    finishCreation(pack);
    await vi.advanceTimersByTimeAsync(0);
    expect(native.deletePack).toHaveBeenCalledWith('late');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a completed pack and clears watchdog timers', async () => {
    const pack = { id: 'done', pause: vi.fn() };
    native.createPack.mockImplementation(async (_options, progress) => {
      progress(pack, { percentage: 100, completedResourceCount: 12, state: 'complete' });
      return pack;
    });
    const progress = vi.fn();
    await new MapLibreMapPackManager(styleUrl).create('tour', bounds, progress);
    expect(native.createPack.mock.calls[0]![0].mapStyle).toBe(styleUrl);
    expect(progress).toHaveBeenCalledWith(1);
    expect(native.deletePack).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    '',
    'https://tiles.openfreemap.org/styles/liberty',
    'https://tile.openstreetmap.org/style.json',
    'https://demotiles.maplibre.org/style.json',
    'http://maps.example.net/style.json',
    'invalid-url',
  ])('does not start native prefetch for an unapproved source: %s', async (url) => {
    const manager = new MapLibreMapPackManager(url);
    expect(manager.supported).toBe(false);
    await expect(manager.create('tour', bounds, vi.fn())).rejects.toThrow('authorized offline map');
    expect(native.createPack).not.toHaveBeenCalled();
    expect(native.deletePack).not.toHaveBeenCalled();
  });
});

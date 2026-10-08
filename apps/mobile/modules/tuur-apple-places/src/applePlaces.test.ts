import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  requireOptionalNativeModule: vi.fn(),
  requireNativeView: vi.fn(),
  searchNearby: vi.fn(),
  cancelSearch: vi.fn(),
}));

vi.mock('expo', () => ({
  requireOptionalNativeModule: native.requireOptionalNativeModule,
  requireNativeView: native.requireNativeView,
}));
vi.mock('react-native', () => ({ Platform: native.platform }));

afterEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  native.platform.OS = 'ios';
});

describe('optional Apple places native boundary', () => {
  it('keeps older iOS binaries safe without requesting a missing map view', async () => {
    native.requireOptionalNativeModule.mockReturnValue(null);
    const api = await import('./applePlaces');
    const { default: MapView } = await import('./TuurApplePlacesView');
    expect(api.isApplePlacesAvailable).toBe(false);
    expect(native.requireOptionalNativeModule).toHaveBeenCalledWith('TuurApplePlaces');
    expect(native.requireNativeView).not.toHaveBeenCalled();
    expect(MapView({ latitude: 52, longitude: 13, places: [] })).toBeNull();
    await expect(api.cancelApplePlacesSearch()).resolves.toBeUndefined();
    await expect(
      api.searchApplePlaces({ latitude: 52, longitude: 13, category: 'all' }),
    ).rejects.toMatchObject({ code: 'ERR_APPLE_PLACES_UNAVAILABLE' });
  });

  it('does not load an Apple module or map on Android', async () => {
    native.platform.OS = 'android';
    const api = await import('./applePlaces');
    await import('./TuurApplePlacesView');
    expect(api.isApplePlacesAvailable).toBe(false);
    expect(native.requireOptionalNativeModule).not.toHaveBeenCalled();
    expect(native.requireNativeView).not.toHaveBeenCalled();
  });

  it('bounds native search requests and forwards cancellation without transforming results into catalog POIs', async () => {
    native.requireOptionalNativeModule.mockReturnValue(native);
    const api = await import('./applePlaces');
    const result = [
      { id: 'apple-session-only', name: 'Cafe', latitude: 52, longitude: 13, category: 'coffee' },
    ];
    native.searchNearby.mockResolvedValue(result);
    const found = await api.searchApplePlaces({
      latitude: 52,
      longitude: 13,
      category: 'coffee',
      radiusMeters: 50_000,
    });
    expect(found).toBe(result);
    expect(native.searchNearby).toHaveBeenCalledWith({
      latitude: 52,
      longitude: 13,
      category: 'coffee',
      radiusMeters: 1500,
    });
    await api.cancelApplePlacesSearch();
    expect(native.cancelSearch).toHaveBeenCalledOnce();
  });

  it('rejects malformed coordinates before a native query', async () => {
    native.requireOptionalNativeModule.mockReturnValue(native);
    const api = await import('./applePlaces');
    for (const options of [
      { latitude: NaN, longitude: 13, category: 'all' as const },
      { latitude: 91, longitude: 13, category: 'all' as const },
      { latitude: 52, longitude: Infinity, category: 'all' as const },
      { latitude: 52, longitude: 13, radiusMeters: NaN, category: 'all' as const },
    ])
      await expect(api.searchApplePlaces(options)).rejects.toMatchObject({
        code: 'ERR_APPLE_PLACES_ARGUMENT',
      });
    expect(native.searchNearby).not.toHaveBeenCalled();
  });
});

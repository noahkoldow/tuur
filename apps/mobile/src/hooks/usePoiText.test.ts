import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PoiSchema } from '@tuur/shared';
import type { Backend, UserInfo } from '../backend/types';

const controls = vi.hoisted(() => ({
  backend: undefined as unknown as Backend,
  user: { uid: 'reader', isAnonymous: false } as UserInfo | null,
  states: [] as unknown[],
  cursor: 0,
  dependencies: undefined as unknown[] | undefined,
  cleanup: undefined as (() => void) | undefined,
}));
vi.mock('../backend', () => ({ useBackend: () => controls.backend }));
vi.mock('../auth/session', () => ({ useAuth: () => ({ user: controls.user }) }));
vi.mock('react', () => ({
  useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
    if (controls.dependencies?.every((value, index) => Object.is(value, deps[index]))) return;
    controls.cleanup?.();
    controls.dependencies = deps;
    controls.cleanup = effect();
  },
  useRef: (initial: unknown) => {
    const index = controls.cursor++;
    if (!(index in controls.states)) controls.states[index] = { current: initial };
    return controls.states[index];
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
import { usePoiText } from './usePoiText';
import { createDemoBackend } from '../backend/demoBackend';

const place = (id = 'gate') =>
  PoiSchema.parse({
    id,
    name: id,
    location: { lat: 52, lng: 13 },
    geohash: 'u33db0',
    tile: 'u33db0',
    interests: ['architecture'],
    rawScore: 50,
    baseScore: 50,
    score: 50,
    sources: {},
    updatedAt: 1,
  });
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function Reader(poi = place(), enabled = true, lang = 'de') {
  controls.cursor = 0;
  return usePoiText(poi, lang, enabled);
}
beforeEach(() => {
  controls.cleanup?.();
  controls.cleanup = undefined;
  controls.dependencies = undefined;
  controls.states = [];
  controls.cursor = 0;
  controls.user = { uid: 'reader', isAnonymous: false };
  controls.backend = createDemoBackend({ latencyMs: 0 });
  controls.backend.auth.current = () => controls.user;
});

describe('on-demand place source reader', () => {
  it('does not fetch unopened cards or complete local text', async () => {
    const getText = vi.spyOn(controls.backend, 'getPoiText');
    Reader(place(), false);
    const local = place();
    local.osmTags['description:de'] = 'Already available.';
    Reader(local);
    await flush();
    expect(getText).not.toHaveBeenCalled();
  });
  it('rejects late information for a previous destination', async () => {
    let resolve!: (poi: ReturnType<typeof place>) => void;
    const first = place();
    const second = place('museum');
    vi.spyOn(controls.backend, 'getPoiText')
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce(second);
    Reader(first);
    Reader(second);
    await flush();
    resolve(first);
    await flush();
    expect(controls.states[0]).toMatchObject({ poi: { id: 'museum' } });
  });
  it('preserves fallback text on failure and consumes an explicit retry only once', async () => {
    const poi = place();
    poi.sources.wikipedia = [{ lang: 'en', title: 'Gate', length: 100, extract: 'Existing English text.' }];
    const getText = vi
      .spyOn(controls.backend, 'getPoiText')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(poi);
    Reader(poi);
    await flush();
    const failed = Reader(poi);
    expect(failed.poi).toBe(poi);
    expect(failed.error).toBe(true);
    failed.retry();
    Reader(poi);
    await flush();
    expect(getText).toHaveBeenCalledTimes(2);
    expect(controls.states[0]).toMatchObject({ poi: { id: poi.id } });
    Reader({ ...poi });
    await flush();
    expect(getText).toHaveBeenCalledTimes(2);
  });
});

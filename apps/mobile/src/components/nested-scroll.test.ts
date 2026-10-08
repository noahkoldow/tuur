import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type HookSlot = {
  value?: unknown;
  dependencies?: readonly unknown[];
  cleanup?: (() => void) | undefined;
};
type HookInstance = { slots: HookSlot[]; cursor: number };

const controls = vi.hoisted(() => ({
  current: undefined as HookInstance | undefined,
  context: null as (() => () => void) | null,
}));

vi.mock('react', () => {
  const nextSlot = () => {
    const instance = controls.current!;
    const index = instance.cursor++;
    return (instance.slots[index] ??= {});
  };
  const unchanged = (slot: HookSlot, dependencies: readonly unknown[]) =>
    slot.dependencies?.length === dependencies.length &&
    slot.dependencies.every((value, index) => Object.is(value, dependencies[index]));
  return {
    createContext: (value: unknown) => ({ value }),
    useContext: () => controls.context,
    useRef: (initial: unknown) => {
      const slot = nextSlot();
      return (slot.value ??= { current: initial });
    },
    useState: (initial: unknown) => {
      const slot = nextSlot();
      if (!('value' in slot)) slot.value = initial;
      return [slot.value, (value: unknown) => (slot.value = value)];
    },
    useCallback: (callback: unknown, dependencies: readonly unknown[]) => {
      const slot = nextSlot();
      if (!unchanged(slot, dependencies)) {
        slot.value = callback;
        slot.dependencies = dependencies;
      }
      return slot.value;
    },
    useEffect: (effect: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
      const slot = nextSlot();
      if (unchanged(slot, dependencies)) return;
      slot.cleanup?.();
      slot.dependencies = dependencies;
      slot.cleanup = effect();
    },
  };
});

import { useNestedScrollLock, useParentScrollLock } from './nested-scroll';

const instances: HookInstance[] = [];
const frames = new Map<number, (time: number) => void>();

function createInstance() {
  const instance: HookInstance = { slots: [], cursor: 0 };
  instances.push(instance);
  return {
    render<T>(hook: () => T): T {
      controls.current = instance;
      instance.cursor = 0;
      return hook();
    },
    unmount() {
      for (const slot of instance.slots) {
        slot.cleanup?.();
        slot.cleanup = undefined;
      }
    },
  };
}

function createParent() {
  const instance = createInstance();
  const read = () => instance.render(useParentScrollLock);
  const parent = read();
  controls.context = parent.acquire;
  return { ...parent, read };
}

function flushFrame() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(16);
}

beforeEach(() => {
  controls.context = null;
  frames.clear();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    const frame = ++nextFrame;
    frames.set(frame, callback);
    return frame;
  });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
});

afterEach(() => {
  for (const instance of instances) {
    for (const slot of instance.slots) slot.cleanup?.();
  }
  instances.length = 0;
  vi.unstubAllGlobals();
});

// These tests exercise ownership and native-event ordering with mocked React hooks.
// They do not simulate platform gesture recognition or prove native scrolling behavior.
describe('nested card scroll ownership', () => {
  it('blocks sheet capture synchronously before the parent rerenders', () => {
    const parent = createParent();
    const reader = createInstance().render(() => useNestedScrollLock(true));
    expect(parent.locked).toBe(false);

    reader.onTouchStart();

    expect(parent.isLocked()).toBe(true);
    expect(parent.read().locked).toBe(true);
    expect(parent.read().acquire).toBe(parent.acquire);
  });

  it('keeps ownership when native touch cancellation precedes drag recognition', () => {
    const parent = createParent();
    const reader = createInstance().render(() => useNestedScrollLock(true));
    reader.onTouchStart();
    reader.onTouchCancel();
    expect(parent.isLocked()).toBe(true);

    reader.onScrollBeginDrag();
    flushFrame();
    expect(parent.isLocked()).toBe(true);

    // Native recognition canceled the JS touch stream; no touch-end will follow.
    reader.onScrollEndDrag();
    flushFrame();
    expect(parent.isLocked()).toBe(false);
    expect(parent.read().locked).toBe(false);
  });

  it.each(['onTouchEnd', 'onTouchCancel'] as const)(
    'releases after %s when no native drag follows',
    (event) => {
      const parent = createParent();
      const reader = createInstance().render(() => useNestedScrollLock(true));
      reader.onTouchStart();
      reader[event]();
      expect(parent.isLocked()).toBe(true);

      flushFrame();
      expect(parent.isLocked()).toBe(false);
    },
  );

  it('releases after drag-end even if the platform omits touch-end', () => {
    const parent = createParent();
    const reader = createInstance().render(() => useNestedScrollLock(true));
    reader.onTouchStart();
    reader.onScrollBeginDrag();
    reader.onScrollEndDrag();

    flushFrame();
    expect(parent.isLocked()).toBe(false);
  });

  it('does not let a deferred release unlock a fresh touch', () => {
    const parent = createParent();
    const reader = createInstance().render(() => useNestedScrollLock(true));
    reader.onTouchStart();
    reader.onTouchEnd();
    reader.onTouchStart();

    flushFrame();
    expect(parent.isLocked()).toBe(true);

    reader.onTouchEnd();
    flushFrame();
    expect(parent.isLocked()).toBe(false);
  });

  it('releases immediately when the card closes and resets an interrupted drag', () => {
    const parent = createParent();
    const instance = createInstance();
    const reader = instance.render(() => useNestedScrollLock(true));
    reader.onTouchStart();
    reader.onScrollBeginDrag();

    instance.render(() => useNestedScrollLock(false));
    expect(parent.isLocked()).toBe(false);

    const reopened = instance.render(() => useNestedScrollLock(true));
    reopened.onTouchStart();
    reopened.onTouchCancel();
    flushFrame();
    expect(parent.isLocked()).toBe(false);
  });

  it('cancels pending work and releases ownership when the card unmounts', () => {
    const parent = createParent();
    const instance = createInstance();
    const reader = instance.render(() => useNestedScrollLock(true));
    reader.onTouchStart();
    reader.onTouchCancel();
    expect(frames.size).toBe(1);

    instance.unmount();

    expect(parent.isLocked()).toBe(false);
    expect(frames.size).toBe(0);
  });

  it('keeps the parent locked until every overlapping card releases its ownership', () => {
    const parent = createParent();
    const firstInstance = createInstance();
    const first = firstInstance.render(() => useNestedScrollLock(true));
    const second = createInstance().render(() => useNestedScrollLock(true));
    first.onTouchStart();
    second.onTouchStart();

    firstInstance.unmount();
    expect(parent.isLocked()).toBe(true);
    expect(parent.read().locked).toBe(true);

    second.onTouchCancel();
    flushFrame();
    expect(parent.isLocked()).toBe(false);
    expect(parent.read().locked).toBe(false);
  });

  it('does not acquire parent ownership while the information face is hidden', () => {
    const parent = createParent();
    const reader = createInstance().render(() => useNestedScrollLock(false));
    reader.onTouchStart();
    reader.onScrollBeginDrag();

    expect(parent.isLocked()).toBe(false);
  });
});

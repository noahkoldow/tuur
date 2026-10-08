import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type AcquireScrollLock = () => () => void;

export const ParentScrollLock = createContext<AcquireScrollLock | null>(null);

/** A synchronous guard for sheet capture, plus native scrollEnabled state. */
export function useParentScrollLock() {
  const owners = useRef(new Set<symbol>());
  const [locked, setLocked] = useState(false);
  const acquire = useCallback(() => {
    const owner = Symbol();
    owners.current.add(owner);
    setLocked(true);
    return () => {
      owners.current.delete(owner);
      setLocked(owners.current.size > 0);
    };
  }, []);
  const isLocked = useCallback(() => owners.current.size > 0, []);
  return { acquire, locked, isLocked };
}

/** Keep the reading gesture in the card, including native cancellation of JS touches. */
export function useNestedScrollLock(enabled: boolean) {
  const acquire = useContext(ParentScrollLock);
  const release = useRef<(() => void) | null>(null);
  const releaseFrame = useRef<number | null>(null);
  const touching = useRef(false);
  const scrolling = useRef(false);

  const unlock = useCallback(() => {
    if (releaseFrame.current !== null) cancelAnimationFrame(releaseFrame.current);
    releaseFrame.current = null;
    release.current?.();
    release.current = null;
  }, []);
  const lock = () => {
    if (releaseFrame.current !== null) cancelAnimationFrame(releaseFrame.current);
    releaseFrame.current = null;
    if (enabled && !release.current) release.current = acquire?.() ?? null;
  };
  const releaseAfterGesture = () => {
    if (releaseFrame.current !== null) cancelAnimationFrame(releaseFrame.current);
    // Android sends touchCancel before scrollBeginDrag.
    // Give the next native event a chance to retain ownership without unlocking the page.
    releaseFrame.current = requestAnimationFrame(() => {
      releaseFrame.current = null;
      if (!touching.current && !scrolling.current) unlock();
    });
  };
  const finishTouch = () => {
    touching.current = false;
    // Native scroll recognition cancels JS touches; the drag still owns the gesture.
    if (!scrolling.current) releaseAfterGesture();
  };

  useEffect(() => {
    if (!enabled) unlock();
    return () => {
      touching.current = false;
      scrolling.current = false;
      unlock();
    };
  }, [acquire, enabled, unlock]);

  return {
    onTouchStart: () => {
      touching.current = true;
      lock();
    },
    onTouchEnd: finishTouch,
    onTouchCancel: finishTouch,
    onScrollBeginDrag: () => {
      scrolling.current = true;
      lock();
    },
    onScrollEndDrag: () => {
      scrolling.current = false;
      finishTouch();
    },
  };
}

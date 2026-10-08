import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Poi } from '@tuur/shared';
import { useReduceMotion } from '../motion';

/** A local inspection only. The caller commits to the route exclusively from the arrow button. */
export function useDestinationPreview(scroll: RefObject<ScrollView | null>, expand: (index: number) => void) {
  const reduced = useReduceMotion();
  const [selection, setSelection] = useState<{ poi: Poi; key: number }>();
  const [revealed, setRevealed] = useState(false);
  const sequence = useRef(0);
  const frame = useRef<number | undefined>(undefined);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bounds = useRef({ y: 0, height: 0 });
  const pending = useRef(false);
  const userScrolling = useRef(false);

  const cancelReveal = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    if (settle.current !== undefined) clearTimeout(settle.current);
  }, []);
  const dismiss = useCallback(() => {
    cancelReveal();
    pending.current = false;
    userScrolling.current = false;
    setSelection(undefined);
    setRevealed(false);
  }, [cancelReveal]);
  useFocusEffect(useCallback(() => dismiss, [dismiss]));

  const onScrollSettled = useCallback(() => {
    if (!pending.current) return;
    pending.current = false;
    if (settle.current !== undefined) clearTimeout(settle.current);
    setRevealed(true);
  }, []);

  const select = useCallback((poi: Poi) => {
    cancelReveal();
    pending.current = true;
    userScrolling.current = false;
    setRevealed(false);
    setSelection({ poi, key: ++sequence.current });
    expand(2);
  }, [cancelReveal, expand]);

  useEffect(() => {
    if (!selection) return;
    // Let the expanded sheet and the two cards lay out before starting the vertical reveal.
    frame.current = requestAnimationFrame(() => {
      scroll.current?.scrollTo({ y: Math.max(0, bounds.current.y - 8), animated: !reduced });
      // Native momentum-end normally finishes the reveal. Already-visible content/web may emit none.
      settle.current = setTimeout(onScrollSettled, reduced ? 0 : 420);
    });
    return cancelReveal;
  }, [selection, scroll, reduced, onScrollSettled, cancelReveal]);

  return {
    selection,
    revealed,
    select,
    dismiss,
    onLayout: (event: LayoutChangeEvent) => { bounds.current = event.nativeEvent.layout; },
    onUserScroll: () => {
      userScrolling.current = true;
      if (pending.current) dismiss();
    },
    onScrollSettled,
    onContentScroll: (y: number, viewportHeight: number) => {
      if (!selection || !userScrolling.current || pending.current) return;
      const card = bounds.current;
      if (card.y + card.height <= y + 12 || card.y >= y + viewportHeight - 12) dismiss();
    },
  };
}

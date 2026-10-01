'use client';

import { onSnapshot, type DocumentData, type Query } from 'firebase/firestore';
import { useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Live Firestore query for the admin area (reads are allowed by the admin claim in the rules; writes go through
 * callables). `makeQuery` returning null disables the subscription; `map` turns a document into a row and may
 * return undefined to skip documents that do not parse. Returns undefined while loading or disabled. A failed
 * subscription (e.g. permission denied, missing index) yields an empty list so pages never spin forever.
 */
export function useLive<T>(
  makeQuery: () => Query | null,
  map: (id: string, data: DocumentData) => T | undefined,
  deps: DependencyList,
): T[] | undefined {
  const [rows, setRows] = useState<T[] | undefined>();
  // the mapper is usually an inline closure; keep the latest one without resubscribing on every render
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    const q = makeQuery();
    setRows(undefined);
    if (!q) return;
    return onSnapshot(
      q,
      (snap) => {
        const next: T[] = [];
        for (const d of snap.docs) {
          const row = mapRef.current(d.id, d.data());
          if (row !== undefined) next.push(row);
        }
        setRows(next);
      },
      (err) => {
        console.warn('[admin] live query failed', err.code, err.message);
        setRows([]);
      },
    );
    // the caller lists the inputs of `makeQuery` in `deps` (react-hooks does not lint this non-hook file)
  }, deps);

  return rows;
}

const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const usdSmall = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** USD amount for the cost views; sub-dollar amounts keep up to four decimals (single calls cost fractions of a cent). */
export const usd = (n: number): string => {
  const v = Number.isFinite(n) ? n : 0;
  return (Math.abs(v) < 1 && v !== 0 ? usdSmall : usdFormat).format(v);
};

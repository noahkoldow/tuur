'use client';

import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { OfferSchema, PartnerSchema, type Offer, type Partner } from '@tuur/shared';
import { useAuth } from './auth';
import { fb } from './firebase';

/**
 * The signed-in partner's own profile, live (`partners/{uid}`; rules allow only the owner and admins).
 * undefined = loading, null = no profile yet (or not signed in).
 */
export function usePartner(): Partner | null | undefined {
  const { user, loading } = useAuth();
  const uid = user?.uid;
  const [partner, setPartner] = useState<Partner | null | undefined>();

  useEffect(() => {
    if (loading) return;
    if (!uid) {
      setPartner(null);
      return;
    }
    setPartner(undefined);
    return onSnapshot(
      doc(fb().db, 'partners', uid),
      (s) => {
        if (!s.exists()) return setPartner(null);
        const p = PartnerSchema.safeParse({ ...s.data(), id: s.id });
        if (!p.success) console.warn('[partner] profile does not match the schema', p.error.issues);
        setPartner(p.success ? p.data : null);
      },
      (err) => {
        console.warn('[partner] profile subscription failed', err.code);
        setPartner(null);
      },
    );
  }, [uid, loading]);

  return partner;
}

/** The partner's offers, live and newest first (partner id = owner uid). undefined = loading. */
export function useOffers(): Offer[] | undefined {
  const { user, loading } = useAuth();
  const uid = user?.uid;
  const [offers, setOffers] = useState<Offer[] | undefined>();

  useEffect(() => {
    if (loading) return;
    if (!uid) {
      setOffers([]);
      return;
    }
    setOffers(undefined);
    return onSnapshot(
      query(collection(fb().db, 'offers'), where('partnerId', '==', uid)),
      (snap) => {
        const list: Offer[] = [];
        for (const d of snap.docs) {
          const o = OfferSchema.safeParse({ ...d.data(), id: d.id });
          if (o.success) list.push(o.data);
        }
        setOffers(list.sort((a, b) => b.updatedAt - a.updatedAt));
      },
      (err) => {
        console.warn('[partner] offers subscription failed', err.code);
        setOffers([]);
      },
    );
  }, [uid, loading]);

  return offers;
}

/** Date (and time when not midnight) in the portal language. */
export function formatDate(ts: number, lang: string): string {
  const d = new Date(ts);
  const withTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return d.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch ms -> value of an `<input type="datetime-local">` in the browser's time zone. */
export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value of an `<input type="datetime-local">` (local time) -> epoch ms; NaN for an empty/invalid value. */
export function fromLocalInput(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return Number.NaN;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)).getTime();
}

import type { Poi } from '@tuur/shared';
import { BackendError, type Backend } from './types';

type Request = Parameters<Backend['getPoiText']>[0];
const TTL_MS = 5 * 60_000;

export function poiTextKey(uid: string | undefined, poi: Poi, request: Request): string {
  const access = request.access;
  return JSON.stringify([
    uid,
    poi.id,
    poi.updatedAt,
    request.lang,
    access?.tourId,
    access?.mode,
    access?.groupId,
  ]);
}

/** Account-scoped in-memory source cache; concurrent readers share a request, never an audio call. */
export class PoiTextCache {
  private entries = new Map<string, { promise: Promise<Poi>; until: number }>();
  constructor(
    private readonly backend: Pick<Backend, 'auth' | 'getPoiText'>,
    private readonly now = Date.now,
  ) {}

  load(poi: Poi, request: Request, retry = false): Promise<Poi> {
    const uid = this.backend.auth.current()?.uid;
    if (!uid) return Promise.reject(new BackendError('unauthenticated', 'Sign in to read place information'));
    const key = poiTextKey(uid, poi, request);
    const cached = this.entries.get(key);
    if (!retry && cached && cached.until > this.now()) return cached.promise;
    const promise = this.backend.getPoiText(request).then((loaded) => {
      if (this.backend.auth.current()?.uid !== uid)
        throw new BackendError('unauthenticated', 'Account changed');
      if (loaded.id !== poi.id) throw new BackendError('unavailable', 'Place information does not match');
      return loaded;
    });
    this.entries.set(key, { promise, until: this.now() + TTL_MS });
    if (this.entries.size > 100) this.entries.delete(this.entries.keys().next().value!);
    void promise.catch(() => {
      if (this.entries.get(key)?.promise === promise) this.entries.delete(key);
    });
    return promise;
  }
}

const caches = new WeakMap<Backend, PoiTextCache>();
export function poiTextCache(backend: Backend): PoiTextCache {
  let cache = caches.get(backend);
  if (!cache) {
    cache = new PoiTextCache(backend);
    caches.set(backend, cache);
  }
  return cache;
}

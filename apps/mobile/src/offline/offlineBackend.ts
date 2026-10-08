import type { Backend } from '../backend/types';
import { BackendError } from '../backend/types';
import { LOCAL_PREFIX, type OfflineLibrary } from './library';
import type { FileStore } from './fileStore';
import { downloadTourMode, coversTour } from '@tuur/shared';
import { downloadedTourScript } from './downloadScript';

/**
 * Offline-first wrapper: downloaded narrations, transitions and tours are answered from the device (also with
 * no network at all); everything else goes to the real backend (spec 4.8: offline the tour runs without network).
 */
export function withOfflineFirst(
  base: Backend,
  library: OfflineLibrary,
  files: FileStore,
  options?: {
    clearAccountDownloads: () => Promise<void>;
  },
): Backend {
  const bindOwner = (uid: string) =>
    library.bindOwner(uid, options?.clearAccountDownloads ?? (() => library.clear()));
  const ensureOwner = async () => {
    const user = await base.auth.ensureSignedIn();
    await bindOwner(user.uid);
    if (base.auth.current()?.uid !== user.uid) throw new BackendError('unauthenticated', 'Account changed');
    return user;
  };
  return {
    ...base,
    kind: base.kind,
    auth: {
      ...base.auth,
      ensureSignedIn: ensureOwner,
      onChange: (cb) =>
        base.auth.onChange((user) => {
          if (user) void bindOwner(user.uid).catch(() => undefined);
          else library.hideForAccountChange();
          cb(user);
        }),
    },
    ensureArea: (tile, rings) => base.ensureArea(tile, rings),
    watchArea: (tile, cb) => base.watchArea(tile, cb),
    getPois: (tiles) => base.getPois(tiles),
    getExploredSpots: (tiles) => base.getExploredSpots(tiles),
    composePlannedRoute: (req) => base.composePlannedRoute(req),
    getTeaser: (req) => base.getTeaser(req),
    getPoiText: (req) => base.getPoiText(req),
    reportNarration: (i) => base.reportNarration(i),
    async getAutoTours(tile, lang) {
      try {
        return await base.getAutoTours(tile, lang);
      } catch (e) {
        await ensureOwner();
        const local = library.tours();
        if (local.length === 0) throw e;
        return {
          status: 'ready',
          placeId: local[0]!.placeId,
          tours: local.map((t) => ({
            id: t.id,
            template: t.template,
            durationMinutes: t.durationMinutes,
            free: t.free,
          })),
        };
      }
    },
    watchTours(placeId, cb) {
      let last: Parameters<typeof cb>[0] = [];
      const merge = () => {
        const local = library.tours(placeId);
        const ids = new Set(last.map((t) => t.id));
        cb([...last, ...local.filter((t) => !ids.has(t.id))]);
      };
      const remote = base.watchTours(placeId, (tours) => {
        last = tours;
        merge();
      });
      const un = library.subscribe(merge);
      void ensureOwner().catch(() => undefined);
      merge();
      return () => {
        remote();
        un();
      };
    },
    async getTour(id) {
      await ensureOwner();
      return library.available(id)?.tour ?? (await base.getTour(id));
    },
    async claimTourStart(tourId, sessionId, mode) {
      await ensureOwner();
      const saved = library.available(tourId);
      if (saved && downloadTourMode(saved.tour) === mode && coversTour(saved, saved.tour))
        return { counted: false, remaining: null };
      return base.claimTourStart(tourId, sessionId, mode);
    },
    async updateTourTime(request) {
      await ensureOwner();
      const saved = request.tourId ? library.available(request.tourId) : undefined;
      if (
        saved &&
        downloadTourMode(saved.tour) === request.mode &&
        coversTour(saved, saved.tour) &&
        downloadedTourScript(saved).instanceId === request.scriptInstanceId
      )
        return {
          sessionId: request.sessionId,
          sequence: request.sequence,
          source: 'legacy',
          offline: true,
          state: request.state,
          remainingSeconds: null,
          leaseExpiresAt: null,
          serverNow: Date.now(),
        };
      return base.updateTourTime(request);
    },
    async getNarration(req) {
      if (req.access?.groupId) return base.getNarration(req);
      if (req.access?.mode === 'roam' || req.access?.mode === 'fork') return base.getNarration(req);
      await ensureOwner();
      const tourId = req.access?.tourId;
      const saved = tourId ? library.available(tourId) : undefined;
      if (!saved || !req.context?.script) return base.getNarration(req);
      const script = downloadedTourScript(saved);
      if (script.id !== req.context.script.id || script.instanceId !== req.context.script.instanceId)
        return base.getNarration(req);
      const local = library.findNarration(req.lang, req.poiId, req.lengthTier, req.access?.tourId);
      if (local) return local;
      return base.getNarration(req);
    },
    async getTransition(req) {
      if (req.access?.groupId) return base.getTransition(req);
      if (req.access?.mode === 'roam' || req.access?.mode === 'fork') return base.getTransition(req);
      await ensureOwner();
      const saved = req.access?.tourId ? library.available(req.access.tourId) : undefined;
      if (!saved || downloadedTourScript(saved).instanceId !== req.scriptInstanceId)
        return base.getTransition(req);
      return (
        library.findTransition(req.lang, req.fromPoiId, req.toPoiId, req.access?.tourId) ??
        base.getTransition(req)
      );
    },
    async audioUrl(path) {
      if (path.startsWith(LOCAL_PREFIX)) {
        await ensureOwner();
        const file = path.slice(LOCAL_PREFIX.length);
        if (!(await files.exists(file))) throw new BackendError('not_found', 'Local audio missing');
        return files.toUrl(file);
      }
      return base.audioUrl(path);
    },
  };
}

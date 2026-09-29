import type { Backend } from '../backend/types';
import { BackendError } from '../backend/types';
import { LOCAL_PREFIX, type OfflineLibrary } from './library';
import type { FileStore } from './fileStore';

/**
 * Offline-first wrapper: downloaded narrations, transitions and tours are answered from the device (also with
 * no network at all); everything else goes to the real backend (spec 4.8: offline the tour runs without network).
 */
export function withOfflineFirst(base: Backend, library: OfflineLibrary, files: FileStore): Backend {
  return {
    ...base,
    kind: base.kind,
    auth: base.auth,
    ensureArea: (tile, rings) => base.ensureArea(tile, rings),
    watchArea: (tile, cb) => base.watchArea(tile, cb),
    getPois: (tiles) => base.getPois(tiles),
    composePlannedRoute: (req) => base.composePlannedRoute(req),
    getTeaser: (req) => base.getTeaser(req),
    reportNarration: (i) => base.reportNarration(i),
    async getAutoTours(tile, lang) {
      try {
        return await base.getAutoTours(tile, lang);
      } catch (e) {
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
      merge();
      return () => {
        remote();
        un();
      };
    },
    async getTour(id) {
      return library.get(id)?.tour ?? (await base.getTour(id));
    },
    async getNarration(req) {
      const local = library.findNarration(req.lang, req.poiId, req.lengthTier);
      if (local) return local;
      return base.getNarration(req);
    },
    async getTransition(req) {
      return library.findTransition(req.lang, req.fromPoiId, req.toPoiId) ?? base.getTransition(req);
    },
    async audioUrl(path) {
      if (path.startsWith(LOCAL_PREFIX)) {
        const file = path.slice(LOCAL_PREFIX.length);
        if (!(await files.exists(file))) throw new BackendError('not_found', 'Local audio missing');
        return files.toUrl(file);
      }
      return base.audioUrl(path);
    },
  };
}

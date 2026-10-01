import {
  estimateDownloadBytes,
  missingItems,
  offlineMapBounds,
  overallProgress,
  planDownload,
  type DownloadItem,
  type LengthTier,
  type OfflineManifest,
  type OfflineNarration,
  type Tour,
} from '@tuur/shared';
import type { Backend } from '../backend/types';
import type { FileStore } from './fileStore';
import type { OfflineLibrary } from './library';
import type { MapPackManager } from './mapPacks';

export type DownloadErrorCode = 'no_space' | 'cancelled' | 'failed';
export class DownloadError extends Error {
  constructor(
    readonly code: DownloadErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface DownloadProgress {
  fraction: number;
  /** Item currently being fetched, for the UI. */
  current?: string;
}

export interface DownloadDeps {
  /** Network backend (never the offline-first wrapper). */
  backend: Backend;
  files: FileStore;
  maps: MapPackManager;
  library: OfflineLibrary;
  now?: () => number;
  concurrency?: number;
  /** Guide voice persona for downloaded audio (settings). */
  voice?: () => string | undefined;
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

/**
 * Offline download of a tour (spec 4.8): triggers generation of missing narrations, then stores audio, texts,
 * images and map tiles. Resumable (existing items are skipped), storage aware, cancellable.
 */
export class DownloadManager {
  constructor(private readonly d: DownloadDeps) {}

  async start(
    tour: Tour,
    lang: string,
    onProgress: (p: DownloadProgress) => void,
    signal?: { cancelled: boolean },
  ): Promise<OfflineManifest> {
    const { files, maps, library } = this.d;
    const now = this.d.now ?? Date.now;
    const need = estimateDownloadBytes(tour);
    const previous = library.get(tour.id);
    if (!previous && (await files.freeBytes()) < need * 1.2)
      throw new DownloadError('no_space', 'Not enough free storage');

    const items = planDownload(tour);
    const fractions: Record<string, number> = {};
    const manifest: OfflineManifest =
      previous && previous.lang === lang
        ? { ...previous, complete: false }
        : {
            version: 1,
            tourId: tour.id,
            lang,
            tour,
            narrations: {},
            transitions: {},
            bytes: 0,
            createdAt: now(),
            complete: false,
          };
    for (const i of items) if (i.kind !== 'tiles' && !missingItems([i], manifest).length) fractions[i.id] = 1;
    const report = (current?: string) =>
      onProgress({ fraction: overallProgress(items, fractions), ...(current ? { current } : {}) });
    report();

    const todo = missingItems(items, manifest);
    const imageFiles = new Map<string, string>();
    let cursor = 0;
    let firstError: Error | undefined;
    const workers = Array.from({ length: Math.max(1, this.d.concurrency ?? 3) }, async () => {
      while (cursor < todo.length && !firstError) {
        if (signal?.cancelled) return;
        const item = todo[cursor++]!;
        try {
          await this.retry(() => this.fetchItem(item, tour, lang, manifest, imageFiles), 2);
          fractions[item.id] = 1;
          report(item.id);
          // persist regularly so an interrupted download can resume
          await library.save({ ...manifest, bytes: await files.sizeOf(`downloads/${tour.id}`) });
        } catch (e) {
          firstError = e as Error;
        }
      }
    });
    await Promise.all(workers);
    if (signal?.cancelled) throw new DownloadError('cancelled', 'Cancelled');
    if (firstError) {
      await library.save({ ...manifest, bytes: await files.sizeOf(`downloads/${tour.id}`) });
      throw new DownloadError('failed', firstError.message);
    }

    // map tiles last (largest, and the tour is usable without them)
    const tiles = items.find((i) => i.kind === 'tiles');
    if (tiles) {
      try {
        await maps.create(tour.id, offlineMapBounds(tour), (f) => {
          fractions[tiles.id] = f;
          report(tiles.id);
        });
        manifest.mapPack = tour.id;
      } catch {
        // audio and texts are fully usable without offline tiles; the map then needs network
      }
      fractions[tiles.id] = 1;
    }
    const done: OfflineManifest = {
      ...manifest,
      complete: true,
      bytes: await files.sizeOf(`downloads/${tour.id}`),
    };
    await library.save(done);
    report();
    return done;
  }

  private async retry<T>(f: () => Promise<T>, times: number): Promise<T> {
    let last: unknown;
    for (let i = 0; i <= times; i++) {
      try {
        return await f();
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 150 * 2 ** i));
      }
    }
    throw last;
  }

  private async fetchImage(
    url: string,
    tourId: string,
    cache: Map<string, string>,
  ): Promise<string | undefined> {
    const hit = cache.get(url);
    if (hit) return hit;
    const path = `downloads/${tourId}/img/${hash(url)}.jpg`;
    try {
      await this.d.files.download(url, path);
      cache.set(url, path);
      return path;
    } catch {
      return undefined; // images are optional; the remote URL stays as fallback
    }
  }

  private async fetchItem(
    item: DownloadItem,
    tour: Tour,
    lang: string,
    m: OfflineManifest,
    imageCache: Map<string, string>,
  ): Promise<void> {
    const { backend, files } = this.d;
    if (item.kind === 'narration') {
      const tier = item.tier as LengthTier;
      const n = await backend.getNarration({
        poiId: item.poiId!,
        lang,
        lengthTier: tier,
        download: true,
        ...(this.d.voice?.() ? { voice: this.d.voice()! } : {}),
        access: { tourId: tour.id, mode: 'tour' },
      });
      const audioFile = `downloads/${tour.id}/audio/${hash(n.key)}.mp3`;
      await files.download(await backend.audioUrl(n.audioPath), audioFile);
      const images = [];
      for (const img of n.images.slice(0, 3)) {
        const local = await this.fetchImage(img.thumbUrl ?? img.url, tour.id, imageCache);
        images.push({ ...img, ...(local ? { localFile: local } : {}) });
      }
      const rec: OfflineNarration = {
        key: n.key,
        title: n.title,
        text: n.text,
        paragraphs: n.paragraphs,
        keyFacts: n.keyFacts,
        audioDurationMs: n.audioDurationMs,
        sponsored: Boolean(n.sponsored),
        audioFile,
        images,
      };
      m.narrations[`${item.poiId}:${tier}`] = rec;
    } else if (item.kind === 'transition') {
      const to = tour.stops.find((s) => s.poiId === item.toPoiId)!;
      const t = await backend.getTransition({
        fromPoiId: item.poiId!,
        toPoiId: item.toPoiId!,
        lang,
        walkMinutes: Math.max(1, Math.round(to.walkMinutesFromPrev)),
        ...(this.d.voice?.() ? { voice: this.d.voice()! } : {}),
        access: { tourId: tour.id, mode: 'tour' },
      });
      const audioFile = `downloads/${tour.id}/audio/${hash(t.key)}.mp3`;
      await files.download(await backend.audioUrl(t.audioPath), audioFile);
      m.transitions[`${item.poiId}:${item.toPoiId}`] = {
        key: t.key,
        text: t.text,
        audioFile,
        audioDurationMs: t.audioDurationMs,
      };
    }
  }

  async remove(tourId: string): Promise<void> {
    await this.d.maps.remove(tourId).catch(() => undefined);
    await this.d.library.remove(tourId);
  }
}

import {
  estimateDownloadBytes,
  createTourScript,
  narrationContextFor,
  missingItems,
  offlineMapBounds,
  overallProgress,
  planDownload,
  downloadTourMode,
  OfflineDownloadAccessSchema,
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

export type DownloadErrorCode = 'no_space' | 'cancelled' | 'failed' | 'unsupported' | 'busy';
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
  /** Native caller supplies expo-crypto; web/tests use the platform UUID generator. */
  newScriptInstanceId?: () => string;
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
  private running = new Set<string>();
  private preparing = new Set<string>();
  private operations = new Map<string, Promise<unknown>>();
  private cancellations = new Map<string, { cancelled: boolean }>();
  private clearing = false;
  private revision = 0;
  constructor(private readonly d: DownloadDeps) {}

  get mapsSupported(): boolean {
    return this.d.maps.supported;
  }

  private async bindOwner(): Promise<void> {
    const user = this.d.backend.auth.current() ?? (await this.d.backend.auth.ensureSignedIn());
    await this.d.library.bindOwner(user.uid, () => this.clearAll(false));
    if (this.d.backend.auth.current()?.uid !== user.uid)
      throw new DownloadError('cancelled', 'Account changed');
  }

  async start(
    tour: Tour,
    lang: string,
    onProgress: (p: DownloadProgress) => void,
    signal?: { cancelled: boolean },
  ): Promise<OfflineManifest> {
    if (!downloadTourMode(tour))
      throw new DownloadError('unsupported', 'Explore and Crossroads need an online connection');
    if (this.clearing || this.running.has(tour.id) || this.preparing.has(tour.id))
      throw new DownloadError('busy', 'This tour is already downloading');
    this.preparing.add(tour.id);
    const revision = this.revision;
    try {
      await this.bindOwner();
    } finally {
      this.preparing.delete(tour.id);
    }
    if (revision !== this.revision) throw new DownloadError('cancelled', 'Account changed');
    if (this.clearing || this.running.has(tour.id))
      throw new DownloadError('busy', 'This tour is already downloading');
    this.running.add(tour.id);
    const cancellation = { cancelled: false };
    const combinedSignal = {
      get cancelled() {
        return cancellation.cancelled || Boolean(signal?.cancelled);
      },
    };
    this.cancellations.set(tour.id, cancellation);
    try {
      const operation = this.download(tour, lang, onProgress, combinedSignal);
      this.operations.set(tour.id, operation);
      return await operation;
    } finally {
      this.running.delete(tour.id);
      this.operations.delete(tour.id);
      this.cancellations.delete(tour.id);
    }
  }

  private async download(
    tour: Tour,
    lang: string,
    onProgress: (p: DownloadProgress) => void,
    signal?: { cancelled: boolean },
  ): Promise<OfflineManifest> {
    const { files, maps, library } = this.d;
    await library.load();
    const now = this.d.now ?? Date.now;
    if (signal?.cancelled) throw new DownloadError('cancelled', 'Cancelled');
    const mode = downloadTourMode(tour)!;
    const need = estimateDownloadBytes(tour);
    const previous = library.get(tour.id);
    const brief = createTourScript({ lang, tour });
    const ownerUid = this.d.backend.auth.current()?.uid;
    if (!ownerUid) throw new DownloadError('cancelled', 'Account changed');
    const reservationPath = `downloads/${tour.id}/reservation.json`;
    const signature = JSON.stringify([
      ownerUid,
      tour.id,
      mode,
      lang,
      brief.id,
      tour.version,
      tour.fingerprint,
      tour.stops.map((stop) => stop.poiId),
    ]);
    let reservation: { scriptInstanceId: string; voiceId?: string } | undefined;
    const savedReservation = await files.readText(reservationPath);
    if (savedReservation) {
      try {
        const parsed: unknown = JSON.parse(savedReservation);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'ownerUid' in parsed &&
          parsed.ownerUid === ownerUid &&
          'signature' in parsed &&
          parsed.signature === signature &&
          'scriptInstanceId' in parsed &&
          typeof parsed.scriptInstanceId === 'string' &&
          /^[A-Za-z0-9_-]{1,120}$/.test(parsed.scriptInstanceId)
        )
          reservation = {
            scriptInstanceId: parsed.scriptInstanceId,
            ...('voiceId' in parsed && typeof parsed.voiceId === 'string' ? { voiceId: parsed.voiceId } : {}),
          };
      } catch {
        // An interrupted reservation write cannot invalidate an existing complete archive.
      }
    }
    const resumable = Boolean(
      previous &&
      previous.lang === lang &&
      previous.script?.id === brief.id &&
      previous.tour.version === tour.version &&
      previous.tour.fingerprint === tour.fingerprint &&
      previous.tour.stops.map((s) => s.poiId).join('|') === tour.stops.map((s) => s.poiId).join('|'),
    );
    const script = {
      ...(resumable && previous?.script ? previous.script : brief),
      instanceId:
        (resumable ? previous?.script?.instanceId : undefined) ??
        reservation?.scriptInstanceId ??
        this.d.newScriptInstanceId?.() ??
        globalThis.crypto.randomUUID(),
    };
    // A persisted identity owns its voice, even if settings changed after a lost response or partial download.
    const voiceId = resumable ? previous?.voiceId : reservation ? reservation.voiceId : this.d.voice?.();
    if (!previous && (await files.freeBytes()) < need * 1.2)
      throw new DownloadError('no_space', 'Not enough free storage');

    // Keep quota idempotency separate from the playable manifest. A denied replacement must not erase an archive.
    if (signal?.cancelled || this.d.backend.auth.current()?.uid !== ownerUid)
      throw new DownloadError('cancelled', 'Account changed');
    await files.writeText(
      reservationPath,
      JSON.stringify({
        version: 1,
        ownerUid,
        signature,
        scriptInstanceId: script.instanceId,
        ...(voiceId ? { voiceId } : {}),
      }),
    );
    if (signal?.cancelled || this.d.backend.auth.current()?.uid !== ownerUid)
      throw new DownloadError('cancelled', 'Account changed');
    const access = OfflineDownloadAccessSchema.parse(
      await this.d.backend.prepareTourDownload(tour.id, mode, script.instanceId),
    );
    if (
      access.tourId !== tour.id ||
      access.mode !== mode ||
      (access.expiresAt !== null && access.expiresAt <= now())
    )
      throw new DownloadError('failed', 'Download access is no longer valid');
    if (signal?.cancelled || this.d.backend.auth.current()?.uid !== ownerUid)
      throw new DownloadError('cancelled', 'Account changed');

    const items = planDownload(tour);
    const fractions: Record<string, number> = {};
    const manifest: OfflineManifest =
      previous && resumable
        ? {
            ...previous,
            tour,
            script,
            ...(voiceId ? { voiceId } : {}),
            access,
            narrations: { ...previous.narrations },
            transitions: { ...previous.transitions },
            complete: false,
          }
        : {
            version: 1,
            tourId: tour.id,
            lang,
            tour,
            script,
            ...(voiceId ? { voiceId } : {}),
            access,
            narrations: {},
            transitions: {},
            bytes: 0,
            createdAt: now(),
            complete: false,
          };
    // A manifest can outlive individual files (interrupted writes or reclaimed storage).
    // Repair missing audio before reporting a complete, resumable download.
    for (const [key, narration] of Object.entries(manifest.narrations))
      if (!(await files.exists(narration.audioFile))) delete manifest.narrations[key];
    for (const [key, transition] of Object.entries(manifest.transitions))
      if (!(await files.exists(transition.audioFile))) delete manifest.transitions[key];
    for (const i of items) if (i.kind !== 'tiles' && !missingItems([i], manifest).length) fractions[i.id] = 1;
    const report = (current?: string) =>
      onProgress({ fraction: overallProgress(items, fractions), ...(current ? { current } : {}) });
    report();

    const todo = missingItems(items, manifest);
    const imageFiles = new Map<string, string>();
    let cursor = 0;
    let firstError: Error | undefined;
    let saving = Promise.resolve();
    const persist = () => {
      const snapshot = {
        ...manifest,
        narrations: { ...manifest.narrations },
        transitions: { ...manifest.transitions },
      };
      saving = saving.then(async () =>
        library.save({ ...snapshot, bytes: await files.sizeOf(`downloads/${tour.id}`) }),
      );
      return saving;
    };
    // Save the personal identity before any provider call, including a crash before the first audio file.
    await persist();
    const workers = Array.from({ length: Math.max(1, this.d.concurrency ?? 3) }, async () => {
      while (cursor < todo.length && !firstError) {
        if (signal?.cancelled) return;
        const item = todo[cursor++]!;
        try {
          await this.retry(() => this.fetchItem(item, tour, lang, manifest, imageFiles), 2);
          fractions[item.id] = 1;
          report(item.id);
          // persist regularly so an interrupted download can resume
          await persist();
        } catch (e) {
          firstError = e as Error;
        }
      }
    });
    await Promise.all(workers);
    await saving;
    if (signal?.cancelled) throw new DownloadError('cancelled', 'Cancelled');
    if (firstError) {
      await library.save({ ...manifest, bytes: await files.sizeOf(`downloads/${tour.id}`) });
      throw new DownloadError('failed', firstError.message);
    }

    // map tiles last (largest, and the tour is usable without them)
    const tiles = items.find((i) => i.kind === 'tiles');
    // A retry replaces its pack; a failed replacement must not retain the old success marker.
    delete manifest.mapPack;
    if (tiles && maps.supported) {
      try {
        await maps.create(
          tour.id,
          offlineMapBounds(tour),
          (f) => {
            fractions[tiles.id] = f;
            report(tiles.id);
          },
          signal ? { signal } : {},
        );
        manifest.mapPack = tour.id;
      } catch {
        // audio and texts are fully usable without offline tiles; the map then needs network
      }
    }
    if (tiles) fractions[tiles.id] = 1;
    if (signal?.cancelled) throw new DownloadError('cancelled', 'Cancelled');
    const done: OfflineManifest = {
      ...manifest,
      complete: true,
      bytes: await files.sizeOf(`downloads/${tour.id}`),
    };
    if (access.expiresAt !== null && access.expiresAt <= now())
      throw new DownloadError('failed', 'Download access expired before completion');
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
        context: narrationContextFor(
          m.script ?? createTourScript({ lang, tour }),
          tour.stops.map((s) => ({ id: s.poiId, name: s.name })),
          item.poiId!,
        ),
        download: true,
        ...(m.voiceId ? { voice: m.voiceId } : {}),
        access: {
          tourId: tour.id,
          mode: downloadTourMode(tour)!,
          ...(m.script?.instanceId ? { downloadId: m.script.instanceId } : {}),
        },
      });
      const audioFile = `downloads/${tour.id}/audio/${hash(n.key)}.mp3`;
      await files.download(n.audioUrl ?? (await backend.audioUrl(n.audioPath)), audioFile);
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
        tourTitle: (m.script ?? createTourScript({ lang, tour })).title,
        ...(m.script?.instanceId ? { scriptInstanceId: m.script.instanceId } : {}),
        download: true,
        ...(m.voiceId ? { voice: m.voiceId } : {}),
        access: {
          tourId: tour.id,
          mode: downloadTourMode(tour)!,
          ...(m.script?.instanceId ? { downloadId: m.script.instanceId } : {}),
        },
      });
      const audioFile = `downloads/${tour.id}/audio/${hash(t.key)}.mp3`;
      await files.download(t.audioUrl ?? (await backend.audioUrl(t.audioPath)), audioFile);
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

  /** Repairs only tiles: stored narrations remain playable, and no content is generated again. */
  async repairMap(
    tourId: string,
    onProgress: (p: DownloadProgress) => void,
    signal?: { cancelled: boolean },
  ): Promise<void> {
    if (!this.mapsSupported) throw new DownloadError('unsupported', 'Offline maps are not available');
    if (this.clearing || this.running.has(tourId) || this.preparing.has(tourId))
      throw new DownloadError('busy', 'This tour is already downloading');
    this.preparing.add(tourId);
    const revision = this.revision;
    try {
      await this.bindOwner();
    } finally {
      this.preparing.delete(tourId);
    }
    if (revision !== this.revision) throw new DownloadError('cancelled', 'Account changed');
    if (this.clearing || this.running.has(tourId))
      throw new DownloadError('busy', 'This tour is already downloading');
    this.running.add(tourId);
    const cancellation = { cancelled: false };
    const combinedSignal = {
      get cancelled() {
        return cancellation.cancelled || Boolean(signal?.cancelled);
      },
    };
    this.cancellations.set(tourId, cancellation);
    const operation = (async () => {
      await this.d.library.load();
      const manifest = this.d.library.available(tourId);
      if (!manifest) throw new DownloadError('failed', 'Download is not available');
      try {
        await this.d.maps.create(
          tourId,
          offlineMapBounds(manifest.tour),
          (fraction) => onProgress({ fraction, current: 'tiles' }),
          { signal: combinedSignal },
        );
        if (combinedSignal.cancelled) throw new DownloadError('cancelled', 'Cancelled');
        await this.d.library.save({ ...manifest, mapPack: tourId });
      } catch (error) {
        if (combinedSignal.cancelled) throw new DownloadError('cancelled', 'Cancelled');
        throw new DownloadError('failed', error instanceof Error ? error.message : 'Map download failed');
      }
    })();
    this.operations.set(tourId, operation);
    try {
      await operation;
    } finally {
      this.running.delete(tourId);
      this.operations.delete(tourId);
      this.cancellations.delete(tourId);
    }
  }

  /** Account deletion waits for writes to stop, then removes every download and native map pack. */
  async clearAll(invalidatePending = true): Promise<void> {
    if (invalidatePending) this.revision++;
    this.clearing = true;
    try {
      for (const signal of this.cancellations.values()) signal.cancelled = true;
      await Promise.allSettled([...this.operations.values()]);
      await this.d.library.load();
      const ids = await this.d.files.listDirs('downloads');
      const maps = await Promise.allSettled(ids.map((id) => this.d.maps.remove(id)));
      const failed = maps.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      // Keep the directory names on a native deletion error so a retry can still find every map pack.
      await this.d.library.clear();
    } finally {
      this.clearing = false;
    }
  }
}

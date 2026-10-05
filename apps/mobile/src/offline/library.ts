import {
  OfflineManifestSchema,
  offlineAccessValid,
  type LengthTier,
  type NarrationResponse,
  type OfflineManifest,
  type Tour,
} from '@tuur/shared';
import type { FileStore } from './fileStore';

export const manifestPath = (tourId: string) => `downloads/${tourId}/manifest.json`;
export const LOCAL_PREFIX = 'local:';
const OWNER_PATH = 'downloads-owner.txt';

export interface DownloadInfo {
  tourId: string;
  title: string;
  lang: string;
  bytes: number;
  complete: boolean;
  hasMap: boolean;
  createdAt: number;
}

/** Index of everything stored on the device; the offline-first backend answers from here before the network. */
export class OfflineLibrary {
  private manifests = new Map<string, OfflineManifest>();
  private listeners = new Set<() => void>();
  /** Stable snapshot for useSyncExternalStore (a fresh array per call would re-render forever). */
  private snapshot: DownloadInfo[] | undefined;
  private loading: Promise<void> | undefined;
  private ownership: Promise<void> = Promise.resolve();
  private mutations: Promise<void> = Promise.resolve();
  private requestedOwner: string | undefined;
  private ownerReady: boolean;
  constructor(
    private readonly files: FileStore,
    private readonly now: () => number = Date.now,
    requireOwner = false,
  ) {
    this.ownerReady = !requireOwner;
  }

  /** Hide immediately on sign-out/change, before asynchronous deletion or authentication completes. */
  hideForAccountChange(): void {
    this.requestedOwner = undefined;
    this.ownerReady = false;
    this.emit();
  }

  /** Legacy downloads bind to their first authenticated owner; a different UID starts an empty library. */
  bindOwner(uid: string, clearDownloads: () => Promise<void>): Promise<void> {
    if (this.requestedOwner === uid) return this.ownership;
    this.requestedOwner = uid;
    this.ownerReady = false;
    this.emit();
    const operation = this.ownership
      .catch(() => undefined)
      .then(async () => {
        await this.load();
        const previous = await this.files.readText(OWNER_PATH);
        if (previous && previous !== uid) await clearDownloads();
        await this.files.writeText(OWNER_PATH, uid);
        if (this.requestedOwner === uid) {
          this.ownerReady = true;
          this.emit();
        }
      })
      .catch((error: unknown) => {
        if (this.requestedOwner === uid) this.requestedOwner = undefined;
        throw error;
      });
    this.ownership = operation;
    return operation;
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  };
  private emit() {
    this.snapshot = undefined;
    this.listeners.forEach((l) => l());
  }

  load(): Promise<void> {
    this.loading ??= this.readManifests().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }

  private async readManifests(): Promise<void> {
    const manifests = new Map<string, OfflineManifest>();
    for (const id of await this.files.listDirs('downloads')) {
      const raw = await this.files.readText(manifestPath(id));
      if (!raw) continue;
      try {
        const parsed = OfflineManifestSchema.safeParse(JSON.parse(raw));
        if (parsed.success) manifests.set(id, parsed.data);
      } catch {
        /* An interrupted manifest write must not hide other complete downloads. */
      }
    }
    this.manifests = manifests;
    this.emit();
  }

  get(tourId: string): OfflineManifest | undefined {
    return this.ownerReady ? this.manifests.get(tourId) : undefined;
  }

  available(tourId: string): OfflineManifest | undefined {
    const manifest = this.get(tourId);
    return manifest?.complete && offlineAccessValid(manifest, this.now()) ? manifest : undefined;
  }

  async save(m: OfflineManifest): Promise<void> {
    return this.mutate(async () => {
      await this.load();
      await this.files.writeText(manifestPath(m.tourId), JSON.stringify(m));
      this.manifests.set(m.tourId, m);
      this.emit();
    });
  }

  /** Persist an integrity failure without racing a queued owner change or replacing a newer download. */
  markIncomplete(expected: OfflineManifest, ownerIsCurrent: () => boolean): Promise<boolean> {
    const operation = this.ownership
      .catch(() => undefined)
      .then(() =>
        this.mutate(async () => {
          if (!ownerIsCurrent() || this.get(expected.tourId) !== expected) return false;
          const partial = { ...expected, complete: false };
          await this.files.writeText(manifestPath(expected.tourId), JSON.stringify(partial));
          if (!ownerIsCurrent() || this.get(expected.tourId) !== expected) return false;
          this.manifests.set(expected.tourId, partial);
          this.emit();
          return true;
        }),
      );
    // A subsequent bindOwner waits for this write before clearing the previous owner's files.
    this.ownership = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async remove(tourId: string): Promise<void> {
    return this.mutate(async () => {
      await this.load();
      await this.files.remove(`downloads/${tourId}`);
      this.manifests.delete(tourId);
      this.emit();
    });
  }

  /** Includes partial/orphan files, not just successfully parsed manifests. */
  async clear(): Promise<void> {
    return this.mutate(async () => {
      await this.load();
      await this.files.remove('downloads');
      this.manifests.clear();
      this.emit();
    });
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.mutations.then(operation);
    this.mutations = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  list(): DownloadInfo[] {
    if (!this.ownerReady) return (this.snapshot ??= []);
    return (this.snapshot ??= [...this.manifests.values()].map((m) => ({
      tourId: m.tourId,
      title: m.tour.texts[m.lang]?.title ?? Object.values(m.tour.texts)[0]?.title ?? m.tour.template,
      lang: m.lang,
      bytes: m.bytes,
      complete: m.complete,
      hasMap: Boolean(m.mapPack),
      createdAt: m.createdAt,
    })));
  }

  tours(placeId?: string): Tour[] {
    if (!this.ownerReady) return [];
    return [...this.manifests.values()]
      .filter(
        (m) => m.complete && offlineAccessValid(m, this.now()) && (!placeId || m.tour.placeId === placeId),
      )
      .map((m) => m.tour);
  }

  /** Any stored item is usable; only complete manifests count as offline tours (see `tours`). */
  findNarration(
    lang: string,
    poiId: string,
    tier: LengthTier,
    tourId?: string,
  ): NarrationResponse | undefined {
    if (!this.ownerReady) return undefined;
    for (const m of this.manifests.values()) {
      if (m.lang !== lang || (tourId && m.tourId !== tourId) || !offlineAccessValid(m, this.now())) continue;
      const n = m.narrations[`${poiId}:${tier}`];
      if (!n) continue;
      return {
        key: n.key,
        title: n.title,
        text: n.text,
        paragraphs: n.paragraphs,
        keyFacts: n.keyFacts,
        audioPath: `${LOCAL_PREFIX}${n.audioFile}`,
        audioDurationMs: n.audioDurationMs,
        images: n.images.map((i) => ({
          url: i.localFile ? this.files.toUrl(i.localFile) : i.url,
          ...(i.thumbUrl ? { thumbUrl: i.localFile ? this.files.toUrl(i.localFile) : i.thumbUrl } : {}),
          ...(i.author ? { author: i.author } : {}),
          license: i.license,
          ...(i.licenseUrl ? { licenseUrl: i.licenseUrl } : {}),
          sourceUrl: i.sourceUrl,
        })),
        cached: true,
        aiGenerated: true,
        ...(n.sponsored ? { sponsored: true } : {}),
      };
    }
    return undefined;
  }

  findTransition(lang: string, fromPoiId: string, toPoiId: string, tourId?: string) {
    if (!this.ownerReady) return undefined;
    for (const m of this.manifests.values()) {
      if (m.lang !== lang || (tourId && m.tourId !== tourId) || !offlineAccessValid(m, this.now())) continue;
      const t = m.transitions[`${fromPoiId}:${toPoiId}`];
      if (t)
        return {
          key: t.key,
          text: t.text,
          audioPath: `${LOCAL_PREFIX}${t.audioFile}`,
          audioDurationMs: t.audioDurationMs,
        };
    }
    return undefined;
  }

  async totalBytes(): Promise<number> {
    return this.files.sizeOf('downloads');
  }
}

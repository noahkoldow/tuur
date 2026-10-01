import {
  OfflineManifestSchema,
  type LengthTier,
  type NarrationResponse,
  type OfflineManifest,
  type Tour,
} from '@tuur/shared';
import type { FileStore } from './fileStore';

export const manifestPath = (tourId: string) => `downloads/${tourId}/manifest.json`;
export const LOCAL_PREFIX = 'local:';

export interface DownloadInfo {
  tourId: string;
  title: string;
  lang: string;
  bytes: number;
  complete: boolean;
  createdAt: number;
}

/** Index of everything stored on the device; the offline-first backend answers from here before the network. */
export class OfflineLibrary {
  private manifests = new Map<string, OfflineManifest>();
  private listeners = new Set<() => void>();
  /** Stable snapshot for useSyncExternalStore (a fresh array per call would re-render forever). */
  private snapshot: DownloadInfo[] | undefined;
  constructor(private readonly files: FileStore) {}

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  };
  private emit() {
    this.snapshot = undefined;
    this.listeners.forEach((l) => l());
  }

  async load(): Promise<void> {
    this.manifests.clear();
    for (const id of await this.files.listDirs('downloads')) {
      const raw = await this.files.readText(manifestPath(id));
      if (!raw) continue;
      const parsed = OfflineManifestSchema.safeParse(JSON.parse(raw));
      if (parsed.success) this.manifests.set(id, parsed.data);
    }
    this.emit();
  }

  get(tourId: string): OfflineManifest | undefined {
    return this.manifests.get(tourId);
  }

  async save(m: OfflineManifest): Promise<void> {
    await this.files.writeText(manifestPath(m.tourId), JSON.stringify(m));
    this.manifests.set(m.tourId, m);
    this.emit();
  }

  async remove(tourId: string): Promise<void> {
    await this.files.remove(`downloads/${tourId}`);
    this.manifests.delete(tourId);
    this.emit();
  }

  list(): DownloadInfo[] {
    return (this.snapshot ??= [...this.manifests.values()].map((m) => ({
      tourId: m.tourId,
      title: m.tour.texts[m.lang]?.title ?? Object.values(m.tour.texts)[0]?.title ?? m.tour.template,
      lang: m.lang,
      bytes: m.bytes,
      complete: m.complete,
      createdAt: m.createdAt,
    })));
  }

  tours(placeId?: string): Tour[] {
    return [...this.manifests.values()]
      .filter((m) => m.complete && (!placeId || m.tour.placeId === placeId))
      .map((m) => m.tour);
  }

  /** Any stored item is usable; only complete manifests count as offline tours (see `tours`). */
  findNarration(lang: string, poiId: string, tier: LengthTier): NarrationResponse | undefined {
    for (const m of this.manifests.values()) {
      if (m.lang !== lang) continue;
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
          url: i.localFile ? `${LOCAL_PREFIX}${i.localFile}` : i.url,
          ...(i.thumbUrl ? { thumbUrl: i.localFile ? `${LOCAL_PREFIX}${i.localFile}` : i.thumbUrl } : {}),
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

  findTransition(lang: string, fromPoiId: string, toPoiId: string) {
    for (const m of this.manifests.values()) {
      if (m.lang !== lang) continue;
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

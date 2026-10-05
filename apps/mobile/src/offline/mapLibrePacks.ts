import { OfflineManager } from '@maplibre/maplibre-react-native';
import type { Bounds } from '@tuur/shared';
import { config } from '../config';
import {
  MapDownloadError,
  offlineMapStyleConfigured,
  type MapDownloadOptions,
  type MapPackManager,
} from './mapPacks';

/** MapLibre offline packs (spec 4.8): tiles for the tour's bounding box plus buffer, zoom 12-17. */
export class MapLibreMapPackManager implements MapPackManager {
  constructor(private readonly styleUrl = config.offlineMapStyleUrl) {}
  get supported() {
    return offlineMapStyleConfigured(this.styleUrl);
  }
  async create(
    name: string,
    b: Bounds,
    onProgress: (fraction: number) => void,
    options: MapDownloadOptions = {},
  ): Promise<void> {
    if (options.signal?.cancelled) throw new MapDownloadError('cancelled', 'Cancelled');
    if (!this.supported)
      throw new MapDownloadError('failed', 'An authorized offline map style is not configured');
    await this.remove(name).catch(() => undefined);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let failed = false;
      let pack: Awaited<ReturnType<typeof OfflineManager.createPack>> | undefined;
      let timeout: ReturnType<typeof setTimeout>;
      let previousCount = -1;
      const discard = () => {
        if (!pack) return;
        const current = pack;
        pack = undefined;
        void current
          .pause()
          .catch(() => undefined)
          .then(() => OfflineManager.deletePack(current.id))
          .catch(() => undefined);
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        failed = Boolean(error);
        clearTimeout(timeout);
        clearInterval(cancellation);
        if (error) {
          discard();
          reject(error);
        } else resolve();
      };
      const armTimeout = () => {
        clearTimeout(timeout);
        timeout = setTimeout(
          () => finish(new MapDownloadError('timeout', 'Map download stopped making progress')),
          options.timeoutMs ?? 60_000,
        );
      };
      const cancellation = setInterval(() => {
        if (options.signal?.cancelled) finish(new MapDownloadError('cancelled', 'Cancelled'));
      }, 200);
      armTimeout();
      void OfflineManager.createPack(
        {
          // The same explicit source is used for display, so cached tiles/glyphs can be found offline.
          mapStyle: this.styleUrl!,
          bounds: [b.west, b.south, b.east, b.north],
          minZoom: 12,
          maxZoom: 17,
          metadata: { name },
        },
        (_pack, status) => {
          if (settled) return;
          if (options.signal?.cancelled) return finish(new MapDownloadError('cancelled', 'Cancelled'));
          if (status.completedResourceCount > previousCount) {
            previousCount = status.completedResourceCount;
            armTimeout();
          }
          onProgress(Math.min(1, status.percentage / 100));
          if (status.state === 'complete') finish();
        },
        (_pack, err) => finish(new MapDownloadError('failed', err.message)),
      )
        .then((created) => {
          pack = created;
          // Native creation may finish after cancellation/timeout; discard that late pack as well.
          if (failed) discard();
        })
        .catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
    });
  }
  async remove(name: string): Promise<void> {
    const packs = await OfflineManager.getPacks();
    for (const p of packs) if (p.metadata['name'] === name) await OfflineManager.deletePack(p.id);
  }
}

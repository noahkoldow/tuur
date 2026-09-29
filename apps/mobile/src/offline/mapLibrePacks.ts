import { OfflineManager } from '@maplibre/maplibre-react-native';
import { resolveMapStyle } from '@tuur/ui';
import type { Bounds } from '@tuur/shared';
import { config } from '../config';
import type { MapPackManager } from './mapPacks';

/** MapLibre offline packs (spec 4.8): tiles for the tour's bounding box plus buffer, zoom 12-17. */
export class MapLibreMapPackManager implements MapPackManager {
  async create(name: string, b: Bounds, onProgress: (fraction: number) => void): Promise<void> {
    const style = resolveMapStyle({
      ...(config.mapStyleUrl ? { styleUrl: config.mapStyleUrl } : {}),
      ...(config.maptilerKey ? { maptilerKey: config.maptilerKey } : {}),
    });
    await this.remove(name).catch(() => undefined);
    await new Promise<void>((resolve, reject) => {
      void OfflineManager.createPack(
        {
          // MapLibre Native accepts a style URL or a style JSON string; prefer EXPO_PUBLIC_MAP_STYLE_URL in production.
          mapStyle: typeof style === 'string' ? style : JSON.stringify(style),
          bounds: [b.west, b.south, b.east, b.north],
          minZoom: 12,
          maxZoom: 17,
          metadata: { name },
        },
        (_pack, status) => {
          onProgress(Math.min(1, status.percentage / 100));
          if (status.state === 'complete') resolve();
        },
        (_pack, err) => reject(new Error(err.message)),
      );
    });
  }
  async remove(name: string): Promise<void> {
    const packs = await OfflineManager.getPacks();
    for (const p of packs) if (p.metadata['name'] === name) await OfflineManager.deletePack(p.id);
  }
}

import type { Bounds } from '@tuur/shared';

export interface MapDownloadOptions {
  signal?: { cancelled: boolean };
  /** Maximum time without progress, including native pack creation. */
  timeoutMs?: number;
}

export class MapDownloadError extends Error {
  constructor(
    readonly code: 'cancelled' | 'timeout' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

export interface MapPackManager {
  readonly supported: boolean;
  /** Downloads map tiles for the bounds; resolves when complete. */
  create(
    name: string,
    bounds: Bounds,
    onProgress: (fraction: number) => void,
    options?: MapDownloadOptions,
  ): Promise<void>;
  remove(name: string): Promise<void>;
}

/** No-op (web preview, tests): reports instant completion. */
export class NoopMapPackManager implements MapPackManager {
  readonly supported = true;
  created: string[] = [];
  async create(name: string, _b: Bounds, onProgress: (f: number) => void, _options?: MapDownloadOptions) {
    this.created.push(name);
    onProgress(1);
  }
  async remove(name: string) {
    this.created = this.created.filter((n) => n !== name);
  }
}

/** No tile source is assumed to allow prefetching just because it serves the live map. */
export function offlineMapStyleConfigured(styleUrl: string | undefined): boolean {
  if (!styleUrl) return false;
  try {
    const url = new URL(styleUrl);
    return (
      url.protocol === 'https:' &&
      !['openfreemap.org', 'openstreetmap.org', 'maplibre.org'].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}

/** Preview platforms cannot install native tile packs and must never report a successful map download. */
export class UnavailableMapPackManager implements MapPackManager {
  readonly supported = false;
  async create(): Promise<void> {
    throw new MapDownloadError('failed', 'Offline maps are not available in this version');
  }
  async remove(): Promise<void> {}
}

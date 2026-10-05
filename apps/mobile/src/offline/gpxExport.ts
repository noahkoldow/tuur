import { buildTourGpx } from '@tuur/shared';
import type { OfflineLibrary } from './library';

export class GpxExportUnavailableError extends Error {
  constructor() {
    super('A complete, accessible tour download is required');
    this.name = 'GpxExportUnavailableError';
  }
}

/** Read at the moment of sharing: account changes and expired downloads cannot expose an older snapshot. */
export function downloadedTourGpx(library: OfflineLibrary, tourId: string) {
  const manifest = library.available(tourId);
  if (!manifest) throw new GpxExportUnavailableError();
  return buildTourGpx(manifest.tour, manifest.tour.texts[manifest.lang]?.title);
}

import { missingItems, planDownload, type Tour } from '@tuur/shared';
import { BackendError, type AuthApi } from '../backend/types';
import type { FileStore } from './fileStore';
import type { OfflineLibrary } from './library';

export interface DownloadedTourSnapshot {
  tour: Tour;
  lang: string;
  complete: boolean;
}

/**
 * Opens only the saved itinerary, including interrupted downloads that can be repaired.
 * Pass the offline backend's auth so ensureSignedIn also restores the library's owner.
 * Access to playback remains governed by OfflineLibrary.available and the saved receipt.
 */
export async function loadDownloadedTour({
  auth,
  library,
  files,
  tourId,
}: {
  auth: Pick<AuthApi, 'ensureSignedIn' | 'current'>;
  library: OfflineLibrary;
  files: Pick<FileStore, 'exists'>;
  tourId: string;
}): Promise<DownloadedTourSnapshot> {
  const user = await auth.ensureSignedIn();
  const checkOwner = () => {
    if (auth.current()?.uid !== user.uid) throw new BackendError('unauthenticated', 'Account changed');
  };
  checkOwner();
  await library.load();
  checkOwner();
  let manifest = library.get(tourId);
  if (!manifest || manifest.tourId !== tourId || manifest.tour.id !== tourId)
    throw new BackendError('not_found', 'Downloaded tour is not available');

  if (manifest.complete) {
    let damaged = missingItems(planDownload(manifest.tour, { tiles: false }), manifest).length > 0;
    const audioFiles = new Set([
      ...Object.values(manifest.narrations).map((n) => n.audioFile),
      ...Object.values(manifest.transitions).map((t) => t.audioFile),
    ]);
    for (const path of audioFiles) {
      const exists = await files.exists(path);
      checkOwner();
      if (library.get(tourId) !== manifest)
        throw new BackendError('not_found', 'Download changed while opening');
      if (!exists) {
        damaged = true;
        break;
      }
    }
    if (damaged) {
      const updated = await library.markIncomplete(manifest, () => auth.current()?.uid === user.uid);
      checkOwner();
      const partial = library.get(tourId);
      if (!updated || !partial) throw new BackendError('not_found', 'Download changed while opening');
      manifest = partial;
    }
  }
  checkOwner();
  return { tour: manifest.tour, lang: manifest.lang, complete: manifest.complete };
}

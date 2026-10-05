import { createTourScript, storyFingerprint, type OfflineManifest, type TourScript } from '@tuur/shared';

/** Reopen this saved personal recording, including archives created before script instances existed. */
export function downloadedTourScript(manifest: OfflineManifest): TourScript {
  if (manifest.script?.instanceId) return manifest.script;
  return {
    ...(manifest.script ?? createTourScript({ lang: manifest.lang, tour: manifest.tour })),
    instanceId: `archive_${storyFingerprint(JSON.stringify([manifest.tourId, manifest.lang, manifest.createdAt]))}`,
  };
}

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;
let sequence = 0;

export class GpxSharingUnavailableError extends Error {
  constructor() {
    super('File sharing is unavailable on this device');
    this.name = 'GpxSharingUnavailableError';
  }
}

function removeExport(directory: Directory) {
  try {
    if (directory.exists) directory.delete();
  } catch {
    // Cache eviction is best effort and must not turn a successful share into an error.
  }
}

function pruneExports(root: Directory, now: number) {
  try {
    for (const entry of root.list()) {
      if (!(entry instanceof Directory)) continue;
      const timestamp = /^export-(\d+)-\d+$/.exec(entry.name)?.[1];
      if (timestamp && now - Number(timestamp) >= CACHE_LIFETIME_MS) removeExport(entry);
    }
  } catch {
    // A concurrent cache eviction must not prevent a new export.
  }
}

/** Share a cache copy of the GPX; the original tour download remains untouched. */
export async function shareGpx(
  prepare: () => { xml: string; fileName: string },
  dialogTitle: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new GpxSharingUnavailableError();
  // Prepare after the async availability check so the caller can recheck current download ownership.
  const { xml, fileName } = prepare();
  const root = new Directory(Paths.cache, 'tuur-gpx');
  root.create({ intermediates: true, idempotent: true });
  const now = Date.now();
  pruneExports(root, now);
  // Separate copies let another app continue reading while the user exports this tour again.
  const directory = new Directory(root, `export-${now}-${++sequence}`);
  directory.create();
  let shared = false;
  try {
    const file = new File(directory, fileName);
    file.create();
    file.write(xml);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/gpx+xml',
      UTI: 'com.topografix.gpx',
      dialogTitle,
    });
    shared = true;
  } finally {
    // iOS resolves after completion. Android resolves when the chooser returns, before a recipient
    // necessarily reads its content URI: keep that copy until a later export prunes old cache files.
    if (!shared || Platform.OS !== 'android') removeExport(directory);
  }
}

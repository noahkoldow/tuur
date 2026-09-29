import { getBaseBackend } from '../backend';
import { createFileStore } from './fileStoreFactory';
import { OfflineLibrary } from './library';
import { DownloadManager } from './manager';
import { createMapPackManager } from './mapPacksFactory';
import type { FileStore } from './fileStore';

let files: FileStore | undefined;
let library: OfflineLibrary | undefined;
let manager: DownloadManager | undefined;

export function getFileStore(): FileStore {
  files ??= createFileStore();
  return files;
}

/** Device library of downloaded tours; `load()` is called once at startup. */
export function getOfflineLibrary(): OfflineLibrary {
  library ??= new OfflineLibrary(getFileStore());
  return library;
}

export function getDownloadManager(): DownloadManager {
  manager ??= new DownloadManager({
    backend: getBaseBackend(),
    files: getFileStore(),
    maps: createMapPackManager(),
    library: getOfflineLibrary(),
  });
  return manager;
}

export * from './library';
export * from './manager';

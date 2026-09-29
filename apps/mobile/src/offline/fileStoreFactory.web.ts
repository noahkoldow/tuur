import type { FileStore } from './fileStore';
import { MemoryFileStore } from './fileStore';

/** Web preview: nothing persists, downloads are simulated in memory. */
export function createFileStore(): FileStore {
  return new MemoryFileStore();
}

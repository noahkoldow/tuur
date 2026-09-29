import { ExpoFileStore } from './expoFileStore';
import type { FileStore } from './fileStore';

export function createFileStore(): FileStore {
  return new ExpoFileStore();
}

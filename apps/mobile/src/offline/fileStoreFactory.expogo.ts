import { config } from '../config';
import { ExpoFileStore } from './expoFileStore';
import { MemoryFileStore, type FileStore } from './fileStore';

/** Expo Go includes expo-file-system, so live audio can persist without a development build. */
export function createFileStore(): FileStore {
  return config.backend === 'demo' ? new MemoryFileStore() : new ExpoFileStore();
}

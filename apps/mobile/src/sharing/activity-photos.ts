import type { PermissionResponse } from 'expo-media-library';
import { Platform } from 'react-native';

export const MAX_ACTIVITY_PHOTOS = 4;
const MAX_PHOTOS_TO_SCAN = 40;
const NATIVE_READ_TIMEOUT_MS = 10_000;
const DISCOVERY_TIMEOUT_MS = 20_000;
const REVALIDATION_TIMEOUT_MS = 15_000;

export type ActivityPhoto = { id: string; uri: string };

export type ActivityPhotosResult =
  | { status: 'ready'; photos: ActivityPhoto[]; limited: boolean }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'unavailable' };

class PhotoReadTimeoutError extends Error {
  constructor() {
    super('Reading activity photos timed out');
    this.name = 'PhotoReadTimeoutError';
  }
}

function abortError() {
  const error = new Error('Activity photo selection was cancelled');
  error.name = 'AbortError';
  return error;
}

function assertActive(signal?: AbortSignal, deadline?: number) {
  if (signal?.aborted) throw abortError();
  if (deadline !== undefined && Date.now() >= deadline) throw new PhotoReadTimeoutError();
}

/** Native reads cannot be cancelled, but late results must not launch more work. */
async function nativeRead<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
  deadline: number | null = Date.now() + NATIVE_READ_TIMEOUT_MS,
): Promise<T> {
  assertActive(signal, deadline ?? undefined);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const value = await new Promise<T>((resolve, reject) => {
      onAbort = () => reject(abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
      if (deadline !== null) {
        timeout = setTimeout(() => reject(new PhotoReadTimeoutError()), deadline - Date.now());
      }
      operation().then(resolve, reject);
    });
    assertActive(signal, deadline ?? undefined);
    return value;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}

function canReadPhotos(permission: PermissionResponse): boolean {
  return (
    permission.accessPrivileges !== 'none' &&
    (permission.granted || permission.accessPrivileges === 'limited')
  );
}

/** Checks access without prompting, including any selected photos under a limited grant. */
export async function hasActivityPhotoPermission(
  photos: readonly ActivityPhoto[] = [],
  signal?: AbortSignal,
): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  const deadline = Date.now() + REVALIDATION_TIMEOUT_MS;
  const library = await nativeRead(() => import('expo-media-library'), signal, deadline);
  const permission = await nativeRead(() => library.getPermissionsAsync(false, ['photo']), signal, deadline);
  if (!canReadPhotos(permission)) return false;

  const readable = await Promise.allSettled(
    photos.map(async ({ id }) => {
      // A fresh native object avoids retaining metadata cached before a limited grant changed.
      const createdAt = await nativeRead(() => new library.Asset(id).getCreationTime(), signal, deadline);
      return createdAt !== null && Number.isFinite(createdAt);
    }),
  );
  assertActive(signal);
  return readable.every((result) => result.status === 'fulfilled' && result.value);
}

/** Call only after the user opts into adding photos to this activity's share card. */
export async function loadActivityPhotos(
  activity: { startedAt: number; endedAt?: number },
  signal?: AbortSignal,
): Promise<ActivityPhotosResult> {
  const { startedAt, endedAt } = activity;
  if (
    (Platform.OS !== 'ios' && Platform.OS !== 'android') ||
    !Number.isFinite(startedAt) ||
    endedAt === undefined ||
    !Number.isFinite(endedAt) ||
    endedAt < startedAt
  ) {
    return { status: 'unavailable' };
  }

  // Loading on demand also lets the share screen handle older native builds gracefully.
  const library = await nativeRead(() => import('expo-media-library'), signal);
  let permission = await nativeRead(() => library.getPermissionsAsync(false, ['photo']), signal);
  if (!canReadPhotos(permission) && permission.canAskAgain) {
    // The user may take as long as needed in the system consent dialog.
    permission = await nativeRead(() => library.requestPermissionsAsync(false, ['photo']), signal, null);
  }
  if (!canReadPhotos(permission)) {
    return { status: 'denied', canAskAgain: permission.canAskAgain };
  }

  const deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
  const { AssetField, MediaType } = library;
  const metadata = await nativeRead(
    () =>
      new library.Query()
        .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
        .gte(AssetField.CREATION_TIME, startedAt)
        .lte(AssetField.CREATION_TIME, endedAt)
        .orderBy(AssetField.CREATION_TIME)
        .limit(MAX_PHOTOS_TO_SCAN)
        .exeForMetadata(),
    signal,
    Math.min(deadline, Date.now() + NATIVE_READ_TIMEOUT_MS),
  );

  // Recheck the bounds before reading a file, including null/invalid camera timestamps.
  const candidates = metadata
    .slice(0, MAX_PHOTOS_TO_SCAN)
    .filter(
      (asset) =>
        asset.mediaType === MediaType.IMAGE &&
        asset.creationTime !== null &&
        Number.isFinite(asset.creationTime) &&
        asset.creationTime >= startedAt &&
        asset.creationTime <= endedAt,
    )
    .sort((a, b) => a.creationTime! - b.creationTime!);

  const photos: ActivityPhoto[] = [];
  const seenIds = new Set<string>();
  for (const candidate of candidates) {
    assertActive(signal, deadline);
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    try {
      // On iOS this resolves a local image URL, downloading from iCloud when needed.
      // A removed, unreadable or unavailable cloud image must not block the other photos.
      const uri = await nativeRead(
        () => new library.Asset(candidate.id).getUri(),
        signal,
        Math.min(deadline, Date.now() + NATIVE_READ_TIMEOUT_MS),
      );
      if (!uri || !/^(file|content):\/\//i.test(uri)) continue;
      photos.push({ id: candidate.id, uri });
      if (photos.length === MAX_ACTIVITY_PHOTOS) break;
    } catch {
      // The asset can disappear or lose permission between discovery and resolution.
      assertActive(signal, deadline);
    }
  }

  return { status: 'ready', photos, limited: permission.accessPrivileges === 'limited' };
}

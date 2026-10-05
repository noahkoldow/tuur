import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { hasActivityPhotoPermission, loadActivityPhotos } from './activity-photos';
import { PhotoSelection } from './photo-selection';

export function useActivityPhotos(activity?: { id: string; startedAt: number; endedAt?: number }) {
  const id = activity?.id;
  const startedAt = activity?.startedAt;
  const endedAt = activity?.endedAt;
  const selection = useMemo(
    () =>
      new PhotoSelection({
        load: (signal) =>
          id
            ? loadActivityPhotos({ startedAt: startedAt ?? NaN, endedAt }, signal)
            : Promise.resolve({ status: 'unavailable' as const }),
        permitted: hasActivityPhotoPermission,
      }),
    [id, startedAt, endedAt],
  );
  const state = useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void selection.revalidate();
    });
    return () => {
      selection.cancel();
      subscription.remove();
    };
  }, [selection]);

  // A native image that never reports success/failure must not block sharing forever.
  const pendingIds = state.photos
    .filter((photo) => !state.displayed.includes(photo.id))
    .map((photo) => photo.id)
    .join('\n');
  useEffect(() => {
    if (!pendingIds) return;
    const timeout = setTimeout(() => {
      for (const photoId of pendingIds.split('\n')) selection.remove(photoId, true);
    }, 15_000);
    return () => clearTimeout(timeout);
  }, [selection, pendingIds]);

  return { state, selection, canShare: selection.canShare() };
}

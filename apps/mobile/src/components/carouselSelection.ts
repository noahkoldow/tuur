export interface CarouselSelection {
  id: string | null;
  index: number;
}

/** Keep the place the walker was looking at when live nearby results change order. */
export function retainCarouselSelection(
  ids: readonly string[],
  previous: CarouselSelection,
  requestedId?: string | null | undefined,
): CarouselSelection {
  if (!ids.length) return { id: null, index: 0 };
  const requested = requestedId ? ids.indexOf(requestedId) : -1;
  if (requested >= 0) return { id: ids[requested]!, index: requested };
  const retained = previous.id === null ? -1 : ids.indexOf(previous.id);
  const index = retained >= 0 ? retained : Math.max(0, Math.min(ids.length - 1, previous.index));
  return { id: ids[index]!, index };
}

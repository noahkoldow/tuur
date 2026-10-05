import type { Poi, SelectNearbyRequest } from '@tuur/shared';
import type { Backend } from '../backend/types';

/** Session-local, bounded AI selection. Location and feasibility remain client-side decisions. */
export class LiveCuration {
  private lastRequest = -Infinity;
  private rankedIds: string[] = [];
  private pending: Promise<void> | undefined;

  constructor(
    private readonly backend: Pick<Backend, 'selectNearby'>,
    private readonly now: () => number = Date.now,
  ) {}

  async rank(candidates: Poi[], context: Omit<SelectNearbyRequest, 'candidateIds'>): Promise<Poi[]> {
    const input = candidates.slice(0, 12);
    if (!input.length) return [];
    if (!this.pending && this.now() - this.lastRequest >= 60_000) {
      this.lastRequest = this.now();
      const ids = input.map((p) => p.id);
      this.pending = this.backend
        .selectNearby({ ...context, candidateIds: ids })
        .then((result) => {
          this.rankedIds = [...new Set(result.poiIds)].filter((id) => ids.includes(id));
        })
        .catch(() => {
          /* Local selection remains available offline and during budget/provider outages. */
        })
        .finally(() => {
          this.pending = undefined;
        });
    }
    if (this.pending) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        this.pending,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 2500);
        }),
      ]);
      clearTimeout(timer);
    }
    const index = new Map(this.rankedIds.map((id, i) => [id, i]));
    return [...input].sort((a, b) => (index.get(a.id) ?? Infinity) - (index.get(b.id) ?? Infinity));
  }
}

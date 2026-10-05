import { beforeEach, describe, expect, it, vi } from 'vitest';
import { destinationPoint, distanceMeters, summarizeWalk } from '@tuur/shared';

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => void storage.set(key, value)),
    removeItem: vi.fn(async (key: string) => void storage.delete(key)),
  },
}));

import { useHistory } from './history';
import type { StopNarration } from '../guide/stopNarration';

const start = { lat: 52.5163, lng: 13.3777 };
const record = { id: 'car-tour', mode: 'roam' as const, startedAt: 0 };

beforeEach(async () => {
  storage.clear();
  await useHistory.persist.rehydrate();
  useHistory.getState().clear();
  useHistory.getState().start(record);
});

describe('removing individual tours from local history', () => {
  it('removes only the selected tour, including its stored stops and route', () => {
    useHistory.getState().addStop(record, { id: 'first-stop', name: 'First stop', location: start });
    useHistory.getState().start({ ...record, id: 'other-tour' });
    useHistory.getState().remove(record.id);
    expect(useHistory.getState().records.map((tour) => tour.id)).toEqual(['other-tour']);
    const stored = JSON.parse(storage.get('tuur.history.v1')!) as {
      state: { records: { id: string }[] };
    };
    expect(stored.state.records.map((tour) => tour.id)).toEqual(['other-tour']);
    expect(storage.get('tuur.history.v1')).not.toContain('first-stop');
  });

  it('does not recreate a deleted record when a running tour reaches another stop or finishes', () => {
    useHistory.getState().remove(record.id);
    useHistory.getState().addStop(record, { id: 'later-stop', name: 'Later stop', location: start });
    useHistory.getState().addTrackPoint(record.id, { ...start, ts: 10_000 });
    expect(useHistory.getState().finish(record.id, 20_000)).toBeUndefined();
    expect(useHistory.getState().records).toEqual([]);
  });

  it('keeps deleted history absent after restarting and recovering the same tour', async () => {
    useHistory.getState().remove(record.id);
    const persisted = storage.get('tuur.history.v1')!;
    useHistory.setState({ records: [], deletedIds: [] });
    storage.set('tuur.history.v1', persisted);
    await useHistory.persist.rehydrate();
    useHistory.getState().start(record);
    useHistory.getState().addStop(record, { id: 'recovered-stop', name: 'Recovered stop', location: start });
    expect(useHistory.getState().records).toEqual([]);
    useHistory.getState().start({ ...record, id: 'new-tour' });
    expect(useHistory.getState().records.map((tour) => tour.id)).toEqual(['new-tour']);
  });

  it('migrates existing history without dropping a tour or preventing new visits', async () => {
    const existing = useHistory.getState().records[0]!;
    storage.set('tuur.history.v1', JSON.stringify({ version: 2, state: { records: [existing] } }));
    await useHistory.persist.rehydrate();
    useHistory.getState().addStop(record, { id: 'new-stop', name: 'New stop', location: start });
    expect(useHistory.getState().records[0]?.stopsVisited).toBe(1);
    expect(useHistory.getState().deletedIds).toEqual([]);
  });
});

describe('bounded tour history for car and public transport', () => {
  it('retains current positions and full distance after crossing the track storage limit', () => {
    const east = destinationPoint(start, 90, 40);
    const northEast = destinationPoint(east, 0, 40);
    const north = destinationPoint(start, 0, 40);
    const loop = [start, east, northEast, north];
    const perimeter = loop.reduce((sum, p, i) => sum + distanceMeters(p, loop[(i + 1) % 4]!), 0);
    for (let i = 0; i <= 2000; i++) {
      useHistory.getState().addTrackPoint(record.id, { ...loop[i % 4]!, ts: i * 2000 });
    }
    const tour = useHistory.getState().finish(record.id, 4_000_000)!;
    expect(tour.track.length).toBeLessThanOrEqual(1500);
    expect(tour.track[0]).toEqual({ ...start, ts: 0 });
    expect(tour.track.at(-1)).toEqual({ ...start, ts: 4_000_000 });
    expect(tour.trackTotals?.distanceM).toBeCloseTo(perimeter * 500, 0);
    const summary = summarizeWalk(tour.track, 0, 0, tour.endedAt, tour.trackTotals);
    expect(summary.distanceM).toBe(Math.round(perimeter * 500));
    expect(summary.movingMs).toBe(4_000_000);
    expect(summary.distanceM).toBeGreaterThan(summarizeWalk(tour.track, 0).distanceM);
  });

  it('initializes totals from older stored tracks without resetting their already traveled distance', () => {
    const middle = destinationPoint(start, 90, 200);
    const end = destinationPoint(start, 90, 400);
    const old = useHistory.getState().records[0]!;
    const { trackTotals: _unused, ...legacy } = old;
    void _unused;
    useHistory.setState({
      records: [
        {
          ...legacy,
          track: [
            { ...start, ts: 0 },
            { ...middle, ts: 10_000 },
          ],
        },
      ],
    });
    useHistory.getState().addTrackPoint(record.id, { ...end, ts: 20_000 });
    expect(useHistory.getState().records[0]?.trackTotals?.distanceM).toBeCloseTo(400, 0);
    expect(useHistory.getState().records[0]?.trackTotals?.movingMs).toBe(20_000);
  });
});

describe('readable places in local tour history', () => {
  const stop = { id: 'gate', name: 'Gate', location: start };
  const narration: StopNarration = {
    key: 'gate:short',
    title: 'A gate with a story',
    text: 'This is the actual story heard during the walk.',
    tier: 'short',
    images: [],
    keyFacts: ['A remembered fact.'],
    aiGenerated: true,
    grounding: { queries: 1, sources: [{ uri: 'https://example.org/gate', title: 'Gate archive' }] },
  };

  it('enriches a visited place without duplicating it and restores the same text after finishing', async () => {
    useHistory.getState().addStop(record, stop);
    useHistory.getState().addStop(record, { ...stop, narration });
    useHistory.getState().finish(record.id, 30_000);
    const persisted = storage.get('tuur.history.v1')!;
    useHistory.setState({ records: [] });
    storage.set('tuur.history.v1', persisted);
    await useHistory.persist.rehydrate();
    const restored = useHistory.getState().records[0]!;
    expect(restored.stops).toEqual([{ ...stop, narration }]);
    expect(restored.stopsVisited).toBe(1);
    expect(restored.endedAt).toBe(30_000);
  });

  it('keeps the longest heard story when replaying or recovering a stop', () => {
    useHistory.getState().addStop(record, { ...stop, narration });
    const longer: StopNarration = { ...narration, key: 'gate:long', tier: 'long', text: 'A longer story.' };
    useHistory.getState().addStop(record, { ...stop, narration: longer });
    useHistory.getState().addStop(record, { ...stop, narration });
    useHistory.getState().addStop(record, stop);
    expect(useHistory.getState().records[0]?.stops).toEqual([{ ...stop, narration: longer }]);
    expect(useHistory.getState().records[0]?.stopsVisited).toBe(1);
  });

  it('keeps older saved places readable by name without requiring a narration', async () => {
    const existing = useHistory.getState().records[0]!;
    storage.set(
      'tuur.history.v1',
      JSON.stringify({
        version: 3,
        state: { records: [{ ...existing, stops: [stop], stopsVisited: 1 }], deletedIds: [] },
      }),
    );
    await useHistory.persist.rehydrate();
    expect(useHistory.getState().records[0]?.stops).toEqual([stop]);
  });
});

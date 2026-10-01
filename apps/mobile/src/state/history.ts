import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appendTrackPoint, type LatLng, type TrackPoint, type WalkedTour } from '@tuur/shared';

export interface TourRecord extends WalkedTour {
  mode: 'tour' | 'planned' | 'fork' | 'roam';
  title?: string;
  startedAt: number;
  updatedAt: number;
  /** Set when the tour was ended (button or finished); open records belong to a running or aborted session. */
  endedAt?: number;
  stops: { id: string; name: string; location: LatLng }[];
  /** Walked GPS track, thinned (device only, never uploaded). */
  track: TrackPoint[];
  /** Planned route as encoded polyline (standard/planned tours). */
  path?: string;
  /** Live group the tour was walked in (D47). */
  groupId?: string;
}

export interface RecordStart {
  id: string;
  mode: TourRecord['mode'];
  title?: string;
  startedAt: number;
  path?: string;
  groupId?: string;
}

interface HistoryState {
  records: TourRecord[];
  /** Creates the record when a session starts (idempotent). */
  start(session: RecordStart): void;
  addStop(session: RecordStart, stop: { id: string; name: string; location: LatLng }): void;
  addTrackPoint(id: string, p: TrackPoint): void;
  /** Ends the record; records without stops and without real walking are dropped (noise). */
  finish(id: string, endedAt: number): TourRecord | undefined;
  clear(): void;
}

const MAX_RECORDS = 200;
const MAX_TRACK_POINTS = 1500;

const centerOf = (pts: LatLng[]): LatLng =>
  pts.length
    ? {
        lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
        lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
      }
    : { lat: 0, lng: 0 };

const fresh = (s: RecordStart, now: number): TourRecord => ({
  id: s.id,
  mode: s.mode,
  ...(s.title ? { title: s.title } : {}),
  ...(s.path ? { path: s.path } : {}),
  ...(s.groupId ? { groupId: s.groupId } : {}),
  startedAt: s.startedAt,
  updatedAt: now,
  stops: [],
  track: [],
  stopsVisited: 0,
  center: { lat: 0, lng: 0 },
});

const upsert = (records: TourRecord[], r: TourRecord) =>
  [r, ...records.filter((x) => x.id !== r.id)].slice(0, MAX_RECORDS);

/**
 * Walked tours with their stops and GPS track, stored on this device only (never uploaded; spec 10 data
 * minimisation). Feeds the tour summary, the profile list and the city badges; cleared with the account deletion.
 */
export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      records: [],
      start: (session) =>
        set((s) =>
          s.records.some((r) => r.id === session.id)
            ? s
            : { records: upsert(s.records, fresh(session, Date.now())) },
        ),
      addStop: (session, stop) =>
        set((s) => {
          const cur = s.records.find((r) => r.id === session.id) ?? fresh(session, Date.now());
          if (cur.stops.some((x) => x.id === stop.id)) return s;
          const stops = [...cur.stops, stop];
          return {
            records: upsert(s.records, {
              ...cur,
              updatedAt: Date.now(),
              stops,
              stopsVisited: stops.length,
              center: centerOf(stops.map((x) => x.location)),
            }),
          };
        }),
      addTrackPoint: (id, p) =>
        set((s) => {
          const cur = s.records.find((r) => r.id === id);
          if (!cur || cur.endedAt || cur.track.length >= MAX_TRACK_POINTS) return s;
          const track = appendTrackPoint(cur.track, p);
          if (track === cur.track) return s;
          return {
            records: s.records.map((r) =>
              r.id === id ? { ...r, track, ...(r.stops.length ? {} : { center: centerOf(track) }) } : r,
            ),
          };
        }),
      finish: (id, endedAt) => {
        const cur = get().records.find((r) => r.id === id);
        if (!cur) return undefined;
        const moved = cur.track.length >= 3;
        if (!cur.stops.length && !moved) {
          set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
          return undefined;
        }
        const done = { ...cur, endedAt: cur.endedAt ?? endedAt, updatedAt: Date.now() };
        set((s) => ({ records: s.records.map((r) => (r.id === id ? done : r)) }));
        return done;
      },
      clear: () => set({ records: [] }),
    }),
    {
      name: 'tuur.history.v1',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      // v1 records had no track
      migrate: (state) => {
        const s = state as { records?: TourRecord[] };
        return { records: (s.records ?? []).map((r) => ({ ...r, track: r.track ?? [] })) } as never;
      },
    },
  ),
);

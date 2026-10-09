import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  appendTrackPoint,
  distanceMeters,
  summarizeWalk,
  type LatLng,
  type TrackPoint,
  type TrackTotals,
  type WalkedTour,
} from '@tuur/shared';
import { preferStopNarration, type StopNarration } from '../guide/stopNarration';

export interface TourRecordStop {
  id: string;
  name: string;
  location: LatLng;
  /** Absent on older records, which still retain their place name and location. */
  narration?: StopNarration;
}

export interface TourRecord extends WalkedTour {
  mode: 'tour' | 'planned' | 'fork' | 'roam';
  title?: string;
  startedAt: number;
  updatedAt: number;
  /** Set when the tour was ended (button or finished); open records belong to a running or aborted session. */
  endedAt?: number;
  stops: TourRecordStop[];
  /** Walked GPS track, thinned (device only, never uploaded). */
  track: TrackPoint[];
  /** Includes segments removed from the display track, so long car/transit tours keep accurate totals. */
  trackTotals?: TrackTotals;
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
  /** Prevent a running or recovered session from recreating history the user explicitly removed. */
  deletedIds: string[];
  /** Creates the record when a session starts (idempotent). */
  start(session: RecordStart): void;
  addStop(session: RecordStart, stop: TourRecordStop): void;
  addTrackPoint(id: string, p: TrackPoint): void;
  /** Ends the record; records without stops and without real walking are dropped (noise). */
  finish(id: string, endedAt: number): TourRecord | undefined;
  remove(id: string): void;
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
  trackTotals: { distanceM: 0, movingMs: 0 },
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
      deletedIds: [],
      start: (session) =>
        set((s) =>
          s.deletedIds.includes(session.id) || s.records.some((r) => r.id === session.id)
            ? s
            : { records: upsert(s.records, fresh(session, Date.now())) },
        ),
      addStop: (session, stop) =>
        set((s) => {
          if (s.deletedIds.includes(session.id)) return s;
          const cur = s.records.find((r) => r.id === session.id) ?? fresh(session, Date.now());
          const previous = cur.stops.find((x) => x.id === stop.id);
          const narration = preferStopNarration(previous?.narration, stop.narration);
          if (previous && narration === previous.narration) return s;
          const saved = { ...stop, ...(narration ? { narration } : {}) };
          const stops = previous
            ? cur.stops.map((x) => (x.id === stop.id ? saved : x))
            : [...cur.stops, saved];
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
          if (!cur || cur.endedAt) return s;
          let track = appendTrackPoint(cur.track, p);
          if (track === cur.track) return s;
          const last = cur.track.at(-1);
          const distance = last ? distanceMeters(last, p) : 0;
          const dt = last ? p.ts - last.ts : 0;
          const totals = cur.trackTotals ?? summarizeWalk(cur.track, cur.stopsVisited);
          const trackTotals = {
            distanceM: totals.distanceM + distance,
            movingMs: totals.movingMs + (dt > 0 && distance / (dt / 1000) >= 0.5 ? dt : 0),
          };
          if (track.length > MAX_TRACK_POINTS) {
            // Thin older points, preserving the start and every recent fix including the current position.
            const older = Math.floor(track.length / 2);
            track = track.filter((_, index) => index >= older || index % 2 === 0);
          }
          return {
            records: s.records.map((r) =>
              r.id === id
                ? { ...r, track, trackTotals, ...(r.stops.length ? {} : { center: centerOf(track) }) }
                : r,
            ),
          };
        }),
      finish: (id, endedAt) => {
        const cur = get().records.find((r) => r.id === id);
        if (!cur) return undefined;
        const moved = cur.track.length >= 3;
        const lasted = endedAt - cur.startedAt >= 30_000;
        if (!cur.stops.length && !moved && !lasted) {
          set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
          return undefined;
        }
        const done = { ...cur, endedAt: cur.endedAt ?? endedAt, updatedAt: Date.now() };
        set((s) => ({ records: s.records.map((r) => (r.id === id ? done : r)) }));
        return done;
      },
      remove: (id) =>
        set((s) =>
          s.records.some((r) => r.id === id)
            ? {
                records: s.records.filter((r) => r.id !== id),
                deletedIds: [...new Set([...s.deletedIds, id])],
              }
            : s,
        ),
      clear: () => set({ records: [], deletedIds: [] }),
    }),
    {
      name: 'tuur.history.v1',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      // v1 records had no track
      migrate: (state) => {
        const s = state as { records?: TourRecord[]; deletedIds?: string[] };
        return {
          records: (s.records ?? []).map((r) => ({ ...r, track: r.track ?? [] })),
          deletedIds: s.deletedIds ?? [],
        } as never;
      },
    },
  ),
);

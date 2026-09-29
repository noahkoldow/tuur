import {
  DEFAULT_TEMPLATES,
  REGION_FIXTURES,
  buildPois,
  encodeGeohash,
  encodePolyline,
  estimateSpeechMs,
  fallbackTourConcept,
  geohashCenter,
  geohashNeighbors,
  layoutParagraphs,
  narrationKey,
  pickFreeTourId,
  planTour,
  syntheticRawPois,
  themesOf,
  tourId,
  PCM_BYTES_PER_SECOND,
  statusForIngest,
  type GenerateToursResult,
  type GetNarrationRequest,
  type NarrationResponse,
  type Poi,
  type RawPoi,
  type Tour,
} from '@tuur/shared';
import { BackendError, type AreaInfo, type AuthApi, type Backend, type UserInfo } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Region {
  key: string;
  placeId: string;
  placeName: string;
  pois: Poi[];
  status: 'ready' | 'low_content';
}

function fixtureRegionFor(tile: string) {
  return REGION_FIXTURES.find((f) => encodeGeohash(f.center.lat, f.center.lng, 3) === tile.slice(0, 3));
}

const NAMES: Record<string, string> = {
  berlin: 'Berlin',
  rothenburg: 'Rothenburg ob der Tauber',
  rural: 'Uckermark',
  kyoto: 'Kyoto',
};

/** Deterministic, factual-looking-free text for demo narrations (generic sentences built from the POI's own data). */
export function demoNarrationParagraphs(poi: Poi, lang: string, tier: 'short' | 'medium' | 'long'): string[] {
  const de = lang === 'de';
  const kind =
    poi.osmTags['tourism'] ??
    poi.osmTags['historic'] ??
    poi.osmTags['amenity'] ??
    poi.osmTags['leisure'] ??
    'place';
  const all = de
    ? [
        `Vor dir liegt ${poi.name}. Das ist einer der Orte, an denen sich ein kurzer Halt lohnt.`,
        `Der Ort gehört zur Kategorie ${kind} und ist gut zu Fuß zu erreichen.`,
        `Schau dich in Ruhe um und achte auf die Details in der Umgebung.`,
        `Viele Besucher gehen hier langsamer, um die Atmosphäre aufzunehmen.`,
        `Wenn du magst, bleib einen Moment stehen und höre auf die Geräusche der Straße.`,
        `Gleich geht es weiter zur nächsten Station.`,
      ]
    : [
        `In front of you is ${poi.name}. It is one of the places worth a short stop.`,
        `The place belongs to the category ${kind} and is easy to reach on foot.`,
        `Take your time to look around and notice the details nearby.`,
        `Many visitors slow down here to soak up the atmosphere.`,
        `If you like, stand still for a moment and listen to the sounds of the street.`,
        `In a moment we continue to the next stop.`,
      ];
  const n = { short: 1, medium: 2, long: 4 }[tier];
  const sentencesPer = { short: 2, medium: 3, long: 6 }[tier];
  const pool = tier === 'long' ? all : all.slice(0, sentencesPer);
  const per = Math.ceil(pool.length / n);
  return Array.from({ length: n }, (_, i) => pool.slice(i * per, (i + 1) * per).join(' ')).filter(Boolean);
}

export function createDemoBackend(opts: { latencyMs?: number } = {}): Backend {
  const latency = opts.latencyMs ?? 300;
  const areas = new Map<string, AreaInfo>();
  const areaListeners = new Map<string, Set<(a: AreaInfo | null) => void>>();
  const regions = new Map<string, Region>();
  const tourListeners = new Map<string, Set<(t: Tour[]) => void>>();
  const tours = new Map<string, Tour>();
  const poiIndex = new Map<string, Poi>();
  const tileRegion = new Map<string, string>();

  const setArea = (tile: string, a: AreaInfo) => {
    areas.set(tile, a);
    areaListeners.get(tile)?.forEach((cb) => cb(a));
  };

  function ingest(tile: string): Region {
    const fx = fixtureRegionFor(tile);
    const key = fx ? fx.key : tile;
    const existing = regions.get(key);
    if (existing) return existing;
    const raw: RawPoi[] = fx ? fx.raw : syntheticRawPois(tile);
    const { pois } = buildPois(raw, { now: Date.now(), precision: 6 });
    const region: Region = {
      key,
      placeId: fx ? `${fx.countryCode}_${fx.key}` : `DEMO_${tile.slice(0, 5)}`,
      placeName: fx ? (NAMES[fx.key] ?? fx.label) : 'Demo City',
      pois,
      status: statusForIngest(pois),
    };
    regions.set(key, region);
    for (const p of pois) poiIndex.set(p.id, p);
    return region;
  }

  const user: { current: UserInfo | null } = { current: null };
  const authListeners = new Set<(u: UserInfo | null) => void>();
  const setUser = (u: UserInfo | null) => {
    user.current = u;
    authListeners.forEach((cb) => cb(u));
    return u;
  };
  const auth: AuthApi = {
    current: () => user.current,
    onChange: (cb) => {
      authListeners.add(cb);
      cb(user.current);
      return () => authListeners.delete(cb);
    },
    ensureSignedIn: async () => user.current ?? setUser({ uid: 'demo-user', isAnonymous: true })!,
    signInWithEmail: async (email) => setUser({ uid: 'demo-user', isAnonymous: false, email })!,
    signInWithApple: async () =>
      setUser({ uid: 'demo-user', isAnonymous: false, email: 'demo@apple.example' })!,
    signInWithGoogle: async () =>
      setUser({ uid: 'demo-user', isAnonymous: false, email: 'demo@google.example' })!,
    signOut: async () => void setUser(null),
  };

  const backend: Backend = {
    kind: 'demo',
    auth,
    async ensureArea(tile) {
      const all = [tile, ...geohashNeighbors(tile)];
      for (const t of all) {
        if (areas.has(t)) continue;
        setArea(t, { status: 'ingesting', poiCount: 0 });
        void sleep(latency * 5).then(() => {
          const region = ingest(t);
          tileRegion.set(t, region.key);
          setArea(t, {
            status: region.status,
            placeId: region.placeId,
            poiCount: region.pois.filter((p) => p.tile === t).length || region.pois.length,
          });
        });
      }
    },
    watchArea(tile, cb) {
      const set = areaListeners.get(tile) ?? new Set();
      set.add(cb);
      areaListeners.set(tile, set);
      cb(areas.get(tile) ?? null);
      return () => set.delete(cb);
    },
    async getAutoTours(tile, lang): Promise<GenerateToursResult> {
      await sleep(latency);
      const region = regions.get(tileRegion.get(tile) ?? '') ?? undefined;
      if (!region) return { status: 'area_not_ready', tours: [] };
      const now = Date.now();
      const built: Tour[] = [];
      for (const template of DEFAULT_TEMPLATES) {
        const res = planTour(region.pois, {
          ...template,
          minCandidates: Math.min(template.minCandidates, 5),
          minStops: Math.min(template.minStops, 3),
        });
        if (!res || res.plan.issues.length) continue;
        const { plan } = res;
        const stops = plan.stops.map((s, i) => ({
          poiId: s.id,
          order: i,
          name: s.name,
          location: s.location,
          dwellMinutes: s.dwellMinutes,
          walkMinutesFromPrev: i === 0 ? 0 : plan.legMinutes[i]!,
          partner: false,
        }));
        const concept = fallbackTourConcept({
          lang,
          templateId: template.id,
          durationMinutes: Math.round(plan.result.totalMinutes),
          placeName: region.placeName,
          themes: [],
          stops: stops.map((s) => ({
            id: s.poiId,
            name: s.name,
            kind: 'place',
            walkMinutesFromPrev: s.walkMinutesFromPrev,
          })),
        });
        const { suggestedOrder: _s, ...text } = concept;
        void _s;
        const lats = plan.stops.map((p) => p.location.lat);
        const lngs = plan.stops.map((p) => p.location.lng);
        const cover = plan.stops.flatMap((s) => s.imageRefs)[0];
        built.push({
          id: tourId(region.placeId, template.id),
          placeId: region.placeId,
          placeName: region.placeName,
          source: 'auto',
          version: 1,
          template: template.id,
          profile: 'foot-walking',
          themes: themesOf(plan.stops),
          stops,
          path: encodePolyline(plan.stops.map((p) => [p.location.lat, p.location.lng] as [number, number])),
          durationMinutes: plan.result.totalMinutes,
          walkMinutes: plan.result.walkMinutes,
          distanceMeters: plan.distanceMeters,
          bbox: {
            south: Math.min(...lats),
            north: Math.max(...lats),
            west: Math.min(...lngs),
            east: Math.max(...lngs),
          },
          routingSource: 'mock',
          fingerprint: '',
          free: false,
          locked: false,
          pinned: false,
          hasPartner: false,
          ...(cover ? { coverImage: cover } : {}),
          texts: { [lang]: text },
          createdAt: now,
          updatedAt: now,
        });
      }
      const freeId = pickFreeTourId(built);
      for (const t of built) {
        const final = { ...t, free: t.id === freeId };
        tours.set(final.id, final);
      }
      const list = [...tours.values()].filter((t) => t.placeId === region.placeId);
      tourListeners.get(region.placeId)?.forEach((cb) => cb(list));
      return {
        status: list.length ? 'ready' : 'no_tours',
        placeId: region.placeId,
        tours: list.map((t) => ({
          id: t.id,
          template: t.template,
          durationMinutes: t.durationMinutes,
          free: t.free,
        })),
      };
    },
    watchTours(placeId, cb) {
      const set = tourListeners.get(placeId) ?? new Set();
      set.add(cb);
      tourListeners.set(placeId, set);
      cb([...tours.values()].filter((t) => t.placeId === placeId));
      return () => set.delete(cb);
    },
    async getTour(id) {
      return tours.get(id) ?? null;
    },
    async getPois(tiles) {
      const keys = new Set(tiles.map((t) => tileRegion.get(t)).filter(Boolean));
      return [...regions.values()].filter((r) => keys.has(r.key)).flatMap((r) => r.pois);
    },
    async getNarration(req: GetNarrationRequest): Promise<NarrationResponse> {
      await sleep(latency);
      const poi = poiIndex.get(req.poiId);
      if (!poi) throw new BackendError('not_found', 'POI not found');
      const paras = demoNarrationParagraphs(poi, req.lang, req.lengthTier);
      const layout = layoutParagraphs(
        paras.map((text) => ({
          text,
          pcmBytes: (estimateSpeechMs(text, req.lang) / 1000) * PCM_BYTES_PER_SECOND,
        })),
      );
      const key = narrationKey(
        { ...req, primaryInterest: req.primaryInterest ?? poi.primaryInterest },
        'demo',
      );
      const last = layout[layout.length - 1];
      return {
        key,
        title: poi.name,
        text: layout.map((l) => l.text).join('\n\n'),
        paragraphs: layout,
        keyFacts: [],
        audioPath: `demo:${key}`,
        audioDurationMs: last ? last.startMs + last.durationMs : 0,
        images: poi.imageRefs,
        cached: false,
        aiGenerated: true,
      };
    },
    async getTransition(req) {
      const to = poiIndex.get(req.toPoiId);
      const text =
        req.lang === 'de'
          ? `Weiter geht es zu ${to?.name ?? 'der nächsten Station'}, etwa ${req.walkMinutes} Minuten zu Fuß.`
          : `Next is ${to?.name ?? 'the next stop'}, about ${req.walkMinutes} minutes on foot.`;
      return {
        key: `demo-tr-${req.fromPoiId}-${req.toPoiId}`,
        text,
        audioPath: `demo:tr:${req.toPoiId}`,
        audioDurationMs: estimateSpeechMs(text, req.lang),
      };
    },
    async audioUrl(audioPath) {
      return `demo://${audioPath}`;
    },
    async reportNarration() {
      await sleep(latency);
    },
  };
  void geohashCenter;
  return backend;
}

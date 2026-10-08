import {
  AI_CONSENT_VERSION,
  type AiConsentState,
  frameScriptParagraphs,
  localObservation,
  isLocalContextPoi,
  filterOsmTags,
  DEFAULT_TEMPLATES,
  SESSION_DURATION_MS,
  decideAudioAccess,
  decideDownloadAccess,
  decideInvite,
  decideSpend,
  downloadTourMode,
  isSubscriber,
  partnerIntro,
  type Entitlement,
  type Wallet,
  REGION_FIXTURES,
  FIXTURE_IMAGES,
  buildPois,
  encodeGeohash,
  encodePolyline,
  estimateSpeechMs,
  fallbackTourConcept,
  distanceMeters,
  geohashCenter,
  geohashNeighbors,
  tilesAround,
  GROUP_BASE_SIZE,
  GROUP_PREMIUM_EXTRA,
  GROUP_MAX_SIZE,
  GROUP_TTL_MS,
  toExploredSpots,
  type PoiStats,
  fitToBudget,
  haversineMatrix,
  type ComposeRouteRequest,
  layoutParagraphs,
  narrationKey,
  narrationContextFor,
  hasRemainingTourTime,
  CREDIT_TOUR_MINUTES,
  type AccessContext,
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
import {
  BackendError,
  type EntitlementState,
  type AreaInfo,
  type AuthApi,
  type Backend,
  type GroupInfo,
  type AccessInfo,
  type TransitionResponse,
  type UserInfo,
} from './types';
import { previewWalkingPath } from './previewRouting';
import { normalizedPhone, requirePrimaryAccount, validPhone } from '../auth/policy';
import { createDemoTimeBudget } from './demoTimeBudget';
import { withDemoPlaceText } from './demoPlaceText';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isNarrationResponse = (
  response: NarrationResponse | TransitionResponse,
): response is NarrationResponse => 'paragraphs' in response;

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

interface DemoTourInput {
  id: string;
  placeId: string;
  placeName: string;
  source: Tour['source'];
  template: string;
  stops: Poi[];
  legMinutes: number[];
  totalMinutes: number;
  walkMinutes: number;
  distanceMeters: number;
  profile?: Tour['profile'];
  lang: string;
  now: number;
  /** Street geometry (preview routing); straight lines between stops otherwise. */
  path?: { lat: number; lng: number }[];
}

/** Builds a Tour document for the demo backend with fact-free fallback texts. */
function makeDemoTour(i: DemoTourInput): Tour {
  const stops = i.stops.map((s, n) => ({
    poiId: s.id,
    order: n,
    name: s.name,
    location: s.location,
    dwellMinutes: s.dwellMinutes,
    walkMinutesFromPrev: n === 0 ? 0 : (i.legMinutes[n] ?? 0),
    partner: false,
  }));
  const concept = fallbackTourConcept({
    lang: i.lang,
    templateId: i.template,
    durationMinutes: Math.round(i.totalMinutes),
    placeName: i.placeName,
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
  const lats = i.stops.map((p) => p.location.lat);
  const lngs = i.stops.map((p) => p.location.lng);
  const cover = i.stops.flatMap((s) => s.imageRefs)[0];
  return {
    id: i.id,
    placeId: i.placeId,
    placeName: i.placeName,
    source: i.source,
    version: 1,
    template: i.template,
    profile: i.profile ?? 'foot-walking',
    themes: themesOf(i.stops),
    stops,
    path: encodePolyline(
      (i.path ?? i.stops.map((p) => p.location)).map((p) => [p.lat, p.lng] as [number, number]),
    ),
    durationMinutes: i.totalMinutes,
    walkMinutes: i.walkMinutes,
    distanceMeters: i.distanceMeters,
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
    texts: { [i.lang]: text },
    createdAt: i.now,
    updatedAt: i.now,
  };
}

export function createDemoBackend(opts: { latencyMs?: number; enforceAccess?: boolean } = {}): Backend {
  const latency = opts.latencyMs ?? 300;
  const areas = new Map<string, AreaInfo>();
  const areaListeners = new Map<string, Set<(a: AreaInfo | null) => void>>();
  const regions = new Map<string, Region>();
  const tourListeners = new Map<string, Set<(t: Tour[]) => void>>();
  const tours = new Map<string, Tour>();
  const ents: Entitlement[] = [];
  const timeBudget = createDemoTimeBudget(() => ents);
  let wallet: Wallet = { balance: 0, rewardBalance: 0 };
  const invites = new Map<string, { tourId: string; expiresAt: number }>();
  const groupsDemo = new Map<string, GroupInfo>();
  const groupListeners = new Map<string, Set<(g: GroupInfo | null) => void>>();
  const recordings = new Map<
    string,
    {
      response: NarrationResponse | TransitionResponse;
      poiId: string;
      fromPoiId?: string;
      scriptInstanceId?: string;
      lang: string;
      voice?: string;
    }
  >();
  const groupRecordings = new Map<string, NarrationResponse | TransitionResponse>();
  const groupSlot = (groupId: string, poiId: string, fromPoiId?: string) =>
    JSON.stringify([groupId, fromPoiId ?? null, poiId]);
  const groupFor = (access: AccessInfo | undefined, poiIds: string[], download = false) => {
    if (!access?.groupId) return undefined;
    const group = groupsDemo.get(access.groupId);
    if (
      !group ||
      group.status !== 'live' ||
      group.expiresAt <= Date.now() ||
      download ||
      !group.audio ||
      !poiIds.every((id) => group.tour.stops.some((stop) => stop.poiId === id))
    )
      throw new BackendError('locked', 'Group access has ended', undefined, 'group_ended');
    return group;
  };
  const contextFor = (access: AccessInfo & { placeId?: string; tile?: string }): AccessContext => {
    const mode = access.mode ?? (access.tourId ? 'tour' : 'roam');
    const tour = access.tourId ? tours.get(access.tourId) : undefined;
    const areaPlace = access.tile ? areas.get(access.tile)?.placeId : undefined;
    if (access.tile && (!areaPlace || (access.placeId && areaPlace !== access.placeId)))
      throw new BackendError('locked', 'Place does not match this area');
    return {
      mode,
      ...(access.tourId ? { tourId: access.tourId, tourFree: tour?.free ?? false } : {}),
      placeId: tour?.placeId ?? areaPlace ?? access.placeId ?? [...regions.values()][0]?.placeId,
    };
  };
  /** Mirrors the server-side check so the demo shows the same locked/unlocked behavior. */
  const gate = (access: AccessInfo | undefined, download = false, poiIds: string[] = [], prepare = false) => {
    const group = groupFor(access, poiIds, download);
    if (group) access = { tourId: group.tour.id, mode: group.mode, sessionId: group.sessionId };
    if (!download && !opts.enforceAccess) return;
    const mode = access?.mode ?? (access?.tourId ? 'tour' : undefined);
    const tour = access?.tourId ? tours.get(access.tourId) : undefined;
    const placeId = tour?.placeId ?? [...regions.values()][0]?.placeId;
    const now = Date.now();
    if (download) {
      if (!tour || downloadTourMode(tour) !== mode)
        throw new BackendError(
          'locked',
          'Only fixed itineraries can be downloaded',
          undefined,
          'download_not_supported',
        );
      if (tour.locked || (tour.expiresAt !== undefined && tour.expiresAt <= now))
        throw new BackendError('locked', 'This route is no longer available');
      if (!poiIds.every((id) => tour.stops.some((stop) => stop.poiId === id)))
        throw new BackendError('locked', 'Stop is not part of this tour');
    }
    const d = (download ? decideDownloadAccess : decideAudioAccess)(
      ents,
      {
        ...(mode ? { mode } : {}),
        ...(access?.tourId ? { tourId: access.tourId, tourFree: tour?.free ?? false } : {}),
        ...(placeId ? { placeId } : {}),
      },
      now,
    );
    if (!d.allowed) throw new BackendError('locked', 'Content is locked', undefined, d.reason);
    const context = { ...contextFor(access ?? {}), ...access };
    if (download) {
      if (!prepare) timeBudget.assertDownload(context);
    } else {
      timeBudget.assertAccess(context);
    }
  };
  /** Demo partners: every sixth POI is a "partner" so the labels, offers and the QR screen can be tried in the preview. */
  const demoPartners = Boolean(opts.enforceAccess);
  const isDemoPartner = (poiId: string) => [...poiIndex.keys()].indexOf(poiId) % 6 === 2;
  const entListeners = new Set<(s: EntitlementState) => void>();
  const emitEnts = () => entListeners.forEach((cb) => cb({ entitlements: [...ents], wallet: { ...wallet } }));
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
    const built = buildPois(raw, { now: Date.now(), precision: 6, images: FIXTURE_IMAGES });
    const pois = built.pois.map(withDemoPlaceText);
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
  let phoneChallenge: { id: string; phone: string; uid: string } | undefined;
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
    ensureSignedIn: async () => requirePrimaryAccount(user.current),
    signInWithEmail: async (email) =>
      setUser({ uid: 'demo-user', isAnonymous: false, email, providerIds: ['password'] })!,
    signInWithApple: async () =>
      setUser({
        uid: 'demo-user',
        isAnonymous: false,
        email: 'demo@apple.example',
        providerIds: ['apple.com'],
      })!,
    signInWithGoogle: async () =>
      setUser({
        uid: 'demo-user',
        isAnonymous: false,
        email: 'demo@google.example',
        providerIds: ['google.com'],
      })!,
    requestPhoneVerification: async (phoneNumber) => {
      if (!user.current || user.current.isAnonymous)
        throw new BackendError('unauthenticated', 'Sign in before verifying a phone number');
      if (!validPhone(phoneNumber))
        throw Object.assign(new Error('Invalid phone number'), { code: 'auth/invalid-phone-number' });
      phoneChallenge = {
        id: `demo-${Date.now()}-${Math.random()}`,
        phone: normalizedPhone(phoneNumber),
        uid: user.current.uid,
      };
      return phoneChallenge.id;
    },
    confirmPhoneVerification: async (verificationId, code) => {
      const current = user.current;
      if (!current || current.isAnonymous || phoneChallenge?.uid !== current.uid)
        throw new BackendError('unauthenticated', 'Sign in before verifying a phone number');
      if (verificationId !== phoneChallenge.id || code !== '000000')
        throw Object.assign(new Error('Invalid verification code'), {
          code: 'auth/invalid-verification-code',
        });
      const phoneNumber = phoneChallenge.phone;
      phoneChallenge = undefined;
      return setUser({ ...current, phoneNumber })!;
    },
    signOut: async () => {
      phoneChallenge = undefined;
      setUser(null);
    },
  };

  const aiChoices = new Map<string, AiConsentState>();
  const backend: Backend = {
    kind: 'demo',
    auth,
    async getAiConsent() {
      const current = await auth.ensureSignedIn();
      return aiChoices.get(current.uid) ?? { granted: false, version: null, updatedAt: null };
    },
    async updateAiConsent(granted) {
      const current = await auth.ensureSignedIn();
      const state = { granted, version: AI_CONSENT_VERSION, updatedAt: Date.now() };
      aiChoices.set(current.uid, state);
      return state;
    },
    async ensureArea(tile, rings) {
      const all = rings !== undefined ? tilesAround(tile, rings) : [tile, ...geohashNeighbors(tile)];
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
        if (template.id === 'local_walk' && built.length) continue;
        const res = planTour(region.pois, {
          ...template,
          minCandidates: Math.min(template.minCandidates, 5),
          minStops: Math.min(template.minStops, 3),
        });
        if (!res || res.plan.issues.length) continue;
        const { plan } = res;
        built.push(
          makeDemoTour({
            id: tourId(region.placeId, template.id),
            placeId: region.placeId,
            placeName: region.placeName,
            source: 'auto',
            template: template.id,
            stops: plan.stops,
            legMinutes: plan.legMinutes,
            totalMinutes: plan.result.totalMinutes,
            walkMinutes: plan.result.walkMinutes,
            distanceMeters: plan.distanceMeters,
            lang,
            now,
          }),
        );
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
    async getWalkingRoute(req) {
      const destination = req.destination ?? (req.poiId ? poiIndex.get(req.poiId)?.location : undefined);
      if (!destination) throw new BackendError('not_found', 'Destination not found');
      const points = await previewWalkingPath([req.origin, destination]);
      if (!points || points.length < 2)
        throw new BackendError('unavailable', 'Preview directions unavailable');
      const distance = points.slice(1).reduce((sum, point, i) => sum + distanceMeters(points[i]!, point), 0);
      return {
        ...(req.poiId ? { poiId: req.poiId } : {}),
        origin: points[0]!,
        destination,
        path: points.map((point) => [point.lat, point.lng] as [number, number]),
        distanceMeters: distance,
        durationSeconds: distance / 1.3,
        routingSource: 'mock',
        profile: req.profile ?? 'foot-walking',
      };
    },
    async selectNearby(req) {
      return {
        poiIds: req.candidateIds.filter((id) => {
          const poi = poiIndex.get(id);
          return poi && !poi.hidden && poi.accessible;
        }),
        source: 'fallback',
      };
    },
    async getExploredSpots(tiles) {
      // Demo: deterministic, made-up popularity so the explore map can be tried; production reads `poiStats`.
      const keys = new Set(tiles.map((t) => tileRegion.get(t)).filter(Boolean));
      const pois = [...regions.values()].filter((r) => keys.has(r.key)).flatMap((r) => r.pois);
      const now = Date.now();
      const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
      const stats: PoiStats[] = pois
        .filter((p) => hash(p.id) % 4 !== 0)
        .map((p) => {
          const h = hash(p.id);
          const explorers = 2 + (h % 9) + Math.round(p.score / 6);
          return {
            poiId: p.id,
            tile: p.tile,
            explorers,
            heat: explorers * (h % 3 === 0 ? 1.6 : 0.4),
            lastAt: now,
          };
        });
      const info = new Map(
        pois.map((p) => {
          const interest = p.primaryInterest ?? p.interests[0];
          const image = p.imageRefs[0];
          return [
            p.id,
            {
              name: p.name,
              location: p.location,
              ...(interest ? { interest } : {}),
              ...(image ? { image } : {}),
            },
          ] as const;
        }),
      );
      return toExploredSpots(stats, info, now);
    },
    async composePlannedRoute(req: ComposeRouteRequest) {
      await sleep(latency);
      const pois = req.stops.map((id) => poiIndex.get(id)).filter((p): p is Poi => Boolean(p));
      if (pois.length === 0) throw new BackendError('not_found', 'Unknown stops');
      const startPt = req.start ?? pois[0]!.location;
      const endPt = req.end ?? (req.roundTrip ? startPt : pois[pois.length - 1]!.location);
      const m = haversineMatrix([startPt, ...pois.map((p) => p.location), endPt], req.profile);
      const open = !req.end && !req.roundTrip;
      const minutes = m.minutes.map((row, i) =>
        row.map((v, j) => (open && j === row.length - 1 ? 0 : !req.start && i === 0 ? 0 : v)),
      );
      if (req.requiredStopIds?.some((id) => !pois.some((p) => p.id === id)))
        throw new BackendError('not_found', 'A chosen stop is unavailable');
      const fit = fitToBudget(
        pois,
        { minutes, meters: m.meters },
        req.budgetMinutes,
        req.interests,
        req.requiredStopIds,
      );
      if (fit.totalMinutes > req.budgetMinutes + 0.5)
        throw new BackendError('unknown', 'The chosen stops do not fit the time budget');
      const kept = fit.order.map((id) => pois.find((p) => p.id === id)!);
      const legs: number[] = [];
      let prev = 0;
      for (const p of kept) {
        const n = pois.indexOf(p) + 1;
        legs.push(minutes[prev]![n]!);
        prev = n;
      }
      const region = [...regions.values()].find((r) => r.pois.some((p) => p.id === pois[0]!.id));
      const streets = await previewWalkingPath([
        ...(req.start ? [req.start] : []),
        ...kept.map((p) => p.location),
        ...(req.roundTrip && req.start ? [req.start] : req.end ? [req.end] : []),
      ]);
      const tour = makeDemoTour({
        id: `planned_${Date.now().toString(36)}`,
        placeId: region?.placeId ?? 'DEMO_planned',
        placeName: region?.placeName ?? 'Demo City',
        source: 'planned',
        template: 'planned',
        stops: kept,
        legMinutes: legs,
        totalMinutes: fit.totalMinutes,
        walkMinutes: legs.reduce((a, b) => a + b, 0),
        distanceMeters: Math.round(
          kept.reduce((d, p, i) => d + (i ? distanceMeters(kept[i - 1]!.location, p.location) : 0), 0) * 1.3,
        ),
        profile: req.profile,
        lang: req.lang,
        now: Date.now(),
        ...(streets ? { path: streets } : {}),
      });
      tour.expiresAt = Date.now() + SESSION_DURATION_MS;
      tours.set(tour.id, tour);
      return { tour, dropped: fit.dropped };
    },
    async getTeaser(req) {
      const poi = poiIndex.get(req.poiId);
      const kind = poi?.osmTags['tourism'] ?? poi?.osmTags['historic'] ?? poi?.osmTags['amenity'] ?? 'place';
      return req.lang === 'de'
        ? `Ein Ort der Kategorie ${kind}, an dem sich ein kurzer Halt lohnt.`
        : `A ${kind} that is worth a short stop.`;
    },
    async getPoiText(req) {
      await sleep(latency);
      const poi = poiIndex.get(req.poiId);
      if (!poi) throw new BackendError('not_found', 'Place is not available');
      return poi;
    },
    async getNarration(req: GetNarrationRequest): Promise<NarrationResponse> {
      await sleep(latency);
      if (req.access?.downloadId && req.access.downloadId !== req.context?.script?.instanceId)
        throw new BackendError('locked', 'Download recording identity does not match');
      if (req.download && (!req.access?.tourId || !['tour', 'planned'].includes(req.access.mode ?? 'tour')))
        throw new BackendError('locked', 'Only fixed itineraries can be downloaded');
      gate(req.access, Boolean(req.download), [req.poiId]);
      const group = groupFor(req.access, [req.poiId], req.download);
      const slot = group ? groupSlot(group.id, req.poiId) : undefined;
      const shared = slot ? groupRecordings.get(slot) : undefined;
      if (shared && isNarrationResponse(shared)) return { ...shared, cached: true };
      if (group) {
        if (group.hostUid !== (user.current?.uid ?? 'demo'))
          throw new BackendError(
            'unavailable',
            'Waiting for the host recording',
            1500,
            'group_audio_pending',
          );
        req = {
          ...req,
          lang: group.audio!.lang,
          voice: group.audio!.voice,
          primaryInterest: group.audio!.primaryInterest,
          context: narrationContextFor(
            group.audio!.script,
            group.tour.stops.map((stop) => ({ id: stop.poiId, name: stop.name })),
            req.poiId,
          ),
        };
      }
      const poi = poiIndex.get(req.poiId);
      if (!poi) throw new BackendError('not_found', 'POI not found');
      const sponsored = demoPartners && isDemoPartner(poi.id);
      const observation =
        !sponsored && isLocalContextPoi(poi)
          ? localObservation(
              {
                poiName: poi.name,
                wikipedia: [],
                facts: [],
                adminFacts: poi.adminFacts,
                osmTags: filterOsmTags(poi.osmTags, req.lang),
              },
              req.lang,
              req.context,
            )
          : undefined;
      const paras = [
        ...(sponsored ? [partnerIntro(req.lang)] : []),
        ...(observation?.paragraphs ??
          frameScriptParagraphs(
            demoNarrationParagraphs(poi, req.lang, req.lengthTier),
            req.context,
            req.lang,
          )),
      ];
      const layout = layoutParagraphs(
        paras.map((text) => ({
          text,
          pcmBytes: (estimateSpeechMs(text, req.lang) / 1000) * PCM_BYTES_PER_SECOND,
        })),
      );
      const contentKey = narrationKey(
        { ...req, primaryInterest: req.primaryInterest ?? poi.primaryInterest },
        'demo',
      );
      const key = `${contentKey}__${req.context?.script?.instanceId ?? 'preview'}__${req.voice ?? 'default'}`;
      const last = layout[layout.length - 1];
      const response: NarrationResponse = {
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
        ...(sponsored ? { sponsored: true } : {}),
      };
      recordings.set(key, {
        response,
        poiId: req.poiId,
        scriptInstanceId: req.context?.script?.instanceId,
        lang: req.lang,
        voice: req.voice,
      });
      if (slot) groupRecordings.set(slot, response);
      return response;
    },
    async getTransition(req) {
      if (req.access?.downloadId && req.access.downloadId !== req.scriptInstanceId)
        throw new BackendError('locked', 'Download recording identity does not match');
      if (req.download && (!req.access?.tourId || !['tour', 'planned'].includes(req.access.mode ?? 'tour')))
        throw new BackendError('locked', 'Only fixed itineraries can be downloaded');
      gate(req.access, Boolean(req.download), [req.fromPoiId, req.toPoiId]);
      const group = groupFor(req.access, [req.fromPoiId, req.toPoiId], req.download);
      const slot = group ? groupSlot(group.id, req.toPoiId, req.fromPoiId) : undefined;
      const shared = slot ? groupRecordings.get(slot) : undefined;
      if (shared) return shared;
      if (group) {
        if (group.hostUid !== (user.current?.uid ?? 'demo'))
          throw new BackendError(
            'unavailable',
            'Waiting for the host recording',
            1500,
            'group_audio_pending',
          );
        req = {
          ...req,
          lang: group.audio!.lang,
          voice: group.audio!.voice,
          scriptInstanceId: group.audio!.script.instanceId,
        };
      }
      const to = poiIndex.get(req.toPoiId);
      const text =
        req.lang === 'de'
          ? `Weiter geht es zu ${to?.name ?? 'der nächsten Station'}, etwa ${req.walkMinutes} Minuten zu Fuß.`
          : `Next is ${to?.name ?? 'the next stop'}, about ${req.walkMinutes} minutes on foot.`;
      const response: TransitionResponse = {
        key: `demo-tr-${req.fromPoiId}-${req.toPoiId}-${req.scriptInstanceId ?? 'preview'}`,
        text,
        audioPath: `demo:tr:${req.toPoiId}:${req.scriptInstanceId ?? 'preview'}`,
        audioDurationMs: estimateSpeechMs(text, req.lang),
      };
      recordings.set(response.key, {
        response,
        poiId: req.toPoiId,
        fromPoiId: req.fromPoiId,
        scriptInstanceId: req.scriptInstanceId,
        lang: req.lang,
        voice: req.voice,
      });
      if (slot) groupRecordings.set(slot, response);
      return response;
    },
    async audioUrl(audioPath) {
      return `demo://${audioPath}`;
    },
    async reportNarration() {
      await sleep(latency);
    },
    async reportContent() {
      await sleep(latency);
    },
    watchEntitlements(cb) {
      entListeners.add(cb);
      cb({ entitlements: [...ents], wallet: { ...wallet } });
      return () => void entListeners.delete(cb);
    },
    async claimTourStart(tourId, _sessionId, mode) {
      await sleep(latency);
      const tour = tours.get(tourId);
      const entitled = ents.some(
        (e) => e.type === 'subscription' || (e.type === 'tour' && e.tourId === tourId),
      );
      const hasSession = tour
        ? ents.some((e) => e.type === 'session' && e.placeId === tour.placeId && e.expiresAt > Date.now())
        : false;
      if (!tour && mode !== 'planned') throw new BackendError('not_found', 'Tour not found');
      if (opts.enforceAccess && !entitled && !(mode === 'planned' && hasSession) && !tour?.free)
        throw new BackendError('locked', 'Tour is locked');
      if (opts.enforceAccess) timeBudget.assertAccess({ ...contextFor({ tourId, mode }), planning: true });
      return { counted: false, remaining: null };
    },
    async updateTourTime(request) {
      const context = contextFor(request);
      if (
        (request.mode === 'tour' || request.mode === 'planned') &&
        (!request.tourId || !tours.has(request.tourId))
      )
        throw new BackendError('not_found', 'Tour not found');
      if (!context.placeId) throw new BackendError('not_found', 'Place not found');
      const result = timeBudget.update(request, { ...context, mode: request.mode }, !opts.enforceAccess);
      emitEnts();
      return result;
    },
    async prepareTourDownload(tourId, mode, scriptInstanceId) {
      const tour = tours.get(tourId);
      if (!tour || downloadTourMode(tour) !== mode)
        throw new BackendError('not_found', 'This route cannot be downloaded');
      if (tour.expiresAt !== undefined && tour.expiresAt <= Date.now())
        throw new BackendError('locked', 'This online route session has expired');
      gate({ tourId, mode }, true, [], true);
      timeBudget.reserveDownload(
        { ...contextFor({ tourId, mode }), mode },
        tour.durationMinutes,
        scriptInstanceId,
      );
      emitEnts();
      return { tourId, mode, grantedAt: Date.now(), expiresAt: null };
    },
    async spendCredit(req) {
      await sleep(latency);
      const now = Date.now();
      const downloadPurchase = req.kind === 'tour' && req.paidOnly === true;
      if (req.kind === 'tour') {
        const tour = tours.get(req.tourId);
        if (!tour || tour.locked) throw new BackendError('not_found', 'Tour not found');
      }
      const unlocked =
        req.kind === 'tour'
          ? ents.some(
              (e) =>
                e.type === 'tour' &&
                e.tourId === req.tourId &&
                hasRemainingTourTime(e) &&
                (e.source === 'credit' ||
                  (!downloadPurchase && e.source === 'invite' && e.timeAllowanceSeconds === undefined)) &&
                (e.expiresAt === null || e.expiresAt > now),
            )
          : ents.some(
              (e) =>
                e.type === 'session' &&
                e.placeId === req.placeId &&
                e.expiresAt > now &&
                hasRemainingTourTime(e),
            );
      const d = decideSpend(wallet, req.kind, unlocked, isSubscriber(ents, now), true);
      if (!d.ok)
        throw new BackendError(
          d.reason === 'insufficient' ? 'insufficient_credit' : 'invite_invalid',
          d.reason,
          undefined,
          d.reason,
        );
      wallet = d.wallet;
      ents.push(
        req.kind === 'tour'
          ? {
              type: 'tour',
              tourId: req.tourId,
              source: d.use === 'reward' ? 'reward' : 'credit',
              grantedAt: now,
              expiresAt: null,
              timeAllowanceSeconds: CREDIT_TOUR_MINUTES * 60,
              timeRemainingSeconds: CREDIT_TOUR_MINUTES * 60,
            }
          : {
              type: 'session',
              placeId: req.placeId,
              source: 'credit',
              grantedAt: now,
              expiresAt: Number.MAX_SAFE_INTEGER,
              timeAllowanceSeconds: CREDIT_TOUR_MINUTES * 60,
              timeRemainingSeconds: CREDIT_TOUR_MINUTES * 60,
            },
      );
      emitEnts();
      return { used: d.use, wallet: { ...wallet } };
    },
    async createInvite(tourId) {
      await sleep(latency);
      const existing = [...invites.values()].filter((i) => i.tourId === tourId).length;
      const d = decideInvite(ents, tourId, existing);
      if (!d.ok) throw new BackendError('invite_invalid', d.reason, undefined, d.reason);
      const token = `demo${Math.random().toString(36).slice(2)}${'x'.repeat(16)}`;
      const expiresAt = Date.now() + 14 * 24 * 3600_000;
      invites.set(token, { tourId, expiresAt });
      return { token, remaining: d.remaining, expiresAt };
    },
    async redeemInvite(token) {
      await sleep(latency);
      const inv = invites.get(token);
      if (!inv || inv.expiresAt <= Date.now())
        throw new BackendError('invite_invalid', 'invite invalid', undefined, 'not_found');
      invites.delete(token);
      ents.push({
        type: 'tour',
        tourId: inv.tourId,
        source: 'invite',
        grantedAt: Date.now(),
        expiresAt: null,
      });
      emitEnts();
      return { tourId: inv.tourId };
    },
    async deleteAccount() {
      ents.length = 0;
      wallet = { balance: 0, rewardBalance: 0 };
      invites.clear();
      timeBudget.reset();
      groupsDemo.clear();
      groupRecordings.clear();
      recordings.clear();
      emitEnts();
      setUser(null);
    },
    async recordPurchaseConsent() {
      await sleep(0);
    },
    async exportMyData() {
      return {
        generatedAt: Date.now(),
        account: { uid: user.current?.uid ?? 'demo-user' },
        entitlements: [...ents],
        wallet,
      };
    },
    async getOffers(poiIds) {
      if (!demoPartners) return [];
      return poiIds.filter(isDemoPartner).map((poiId) => ({
        id: `demo-offer-${poiId}`,
        poiId,
        partnerName: 'Café Linde',
        title: '10 % auf Kuchen',
        description: 'Gegen Vorlage des QR-Codes.',
        terms: 'Nicht kombinierbar.',
        validUntil: Date.now() + 7 * 86_400_000,
      }));
    },
    async submitPartnerApplication() {
      await sleep(latency);
      return { id: `demo-application-${Date.now()}` };
    },
    // Demo groups live in memory; joining a link adds a simulated friend so the flow can be tried on one device.
    async createGroup(req) {
      await sleep(latency);
      const tour = tours.get(req.tourId);
      if (!tour) throw new BackendError('not_found', 'Tour not found');
      gate({ tourId: req.tourId, mode: req.mode, sessionId: req.sessionId });
      const id = `demogroup${Date.now().toString(36)}`;
      const g: GroupInfo = {
        id,
        tour,
        mode: req.mode,
        audio: req.audio,
        ...(req.sessionId ? { sessionId: req.sessionId } : {}),
        hostUid: user.current?.uid ?? 'demo',
        members: 1,
        capacity: GROUP_BASE_SIZE + (isSubscriber(ents, Date.now()) ? GROUP_PREMIUM_EXTRA : 0),
        status: 'live',
        expiresAt: Date.now() + GROUP_TTL_MS,
      };
      groupsDemo.set(id, g);
      for (const seed of req.recordings ?? []) {
        const recording = recordings.get(seed.key);
        if (
          recording &&
          recording.poiId === seed.poiId &&
          recording.fromPoiId === seed.fromPoiId &&
          recording.scriptInstanceId === req.audio.script.instanceId &&
          recording.lang === req.audio.lang &&
          recording.voice === req.audio.voice &&
          tour.stops.some((stop) => stop.poiId === seed.poiId)
        )
          groupRecordings.set(groupSlot(id, seed.poiId, seed.fromPoiId), recording.response);
      }
      return { token: `${id}.${'d'.repeat(43)}`, group: g };
    },
    async joinGroup(token) {
      await sleep(latency);
      const g = groupsDemo.get(token.split('.')[0] ?? '');
      if (!g || g.status !== 'live') throw new BackendError('not_found', 'Invite not valid');
      if (g.members >= g.capacity) throw new BackendError('locked', 'Group is full', undefined, 'full');
      const next = { ...g, members: g.members + 1 };
      groupsDemo.set(g.id, next);
      groupListeners.get(g.id)?.forEach((l) => l(next));
      return { group: next };
    },
    async addGroupSeat(groupId) {
      await sleep(latency);
      const g = groupsDemo.get(groupId);
      if (!g) throw new BackendError('not_found', 'Group not found');
      const next = { ...g, capacity: Math.min(GROUP_MAX_SIZE, g.capacity + 1) };
      groupsDemo.set(groupId, next);
      groupListeners.get(groupId)?.forEach((l) => l(next));
      return { capacity: next.capacity, seatBalance: 0 };
    },
    async leaveGroup(groupId) {
      const g = groupsDemo.get(groupId);
      if (!g) return;
      const next = { ...g, status: 'ended' as const };
      groupsDemo.set(groupId, next);
      groupListeners.get(groupId)?.forEach((l) => l(next));
    },
    watchGroup(groupId, cb) {
      const set = groupListeners.get(groupId) ?? new Set();
      set.add(cb);
      groupListeners.set(groupId, set);
      cb(groupsDemo.get(groupId) ?? null);
      return () => void set.delete(cb);
    },
    async recordVisit() {
      // demo: popularity is synthetic (see getExploredSpots)
    },
    async recordPartnerEvent() {
      await sleep(0);
    },
    async createRedemptionToken() {
      await sleep(latency);
      if (!demoPartners)
        throw new BackendError('redeem_denied', 'no offers in demo', undefined, 'offer_inactive');
      const expiresAt = Date.now() + 10 * 60_000;
      return {
        token: `tuur1.DemoTokenDemo.${expiresAt}.${'A'.repeat(43)}`,
        tokenId: 'demo',
        expiresAt,
        offerTitle: '10 % auf Kuchen',
        partnerName: 'Café Linde',
      };
    },
    watchRedemption: () => () => undefined,
    demo: {
      grantCredits(n) {
        wallet = { ...wallet, balance: wallet.balance + n };
        emitEnts();
      },
      grantRewardCredit() {
        wallet = { ...wallet, rewardBalance: wallet.rewardBalance + 1 };
        emitEnts();
      },
      grantSubscription(productId = 'tuur_sub_monthly') {
        ents.push({
          type: 'subscription',
          active: true,
          productId,
          expiresAt: Date.now() + (productId === 'tuur_sub_yearly' ? 365 : 30) * 24 * 3600_000,
          willRenew: true,
          updatedAt: Date.now(),
        });
        emitEnts();
      },
    },
    async createRewardNonce(request) {
      await sleep(latency);
      const tour = tours.get(request.tourId);
      if (!user.current?.phoneNumber)
        throw new BackendError('unauthenticated', 'Phone verification required');
      if (!tour?.free) throw new BackendError('not_found', 'Free tour not available');
      if (ents.some((e) => e.type === 'tour' && e.source === 'free' && e.placeId === tour.placeId))
        throw new BackendError('locked', 'Free tour already used in this city');
      ents.push({
        type: 'tour',
        tourId: tour.id,
        placeId: tour.placeId,
        source: 'free',
        grantedAt: Date.now(),
        expiresAt: null,
      });
      emitEnts();
      return {
        nonce: `demo-${Math.random().toString(36).slice(2)}`,
        remainingToday: 0,
        purpose: 'free_tour',
      };
    },
  };
  void geohashCenter;
  return backend;
}

import { formatKm } from '../format';
import type { GuideUi } from '../guide/runtime';
import type { SessionMode } from '../guide/session';
import type { NavigationRouteState } from '../guide/navigation-route';

/** Only presentation data crosses into the widget; route and user coordinates stay in the app. */
export interface LiveActivityContent {
  title: string;
  subtitle: string;
  status: string;
  distance: string;
  progress: string;
  progressValue: number;
  symbol: string;
  compactText: string;
  /** System-rendered fallback if ActivityKit marks this entire snapshot stale. */
  staleStatus: string;
  staleCompact: string;
}

export interface LiveActivityOptions {
  mode: SessionMode;
  title?: string;
  lang: string;
  /** The app cannot currently provide a fresh position, e.g. backgrounded without permission. */
  locationStale?: boolean;
  navigation?: Pick<NavigationRouteState, 'status' | 'distanceM'>;
}

const copy = {
  en: {
    tour: 'Your tour',
    planned: 'Your route',
    fork: 'Crossroads',
    roam: 'Roam',
    next: 'Next stop',
    listening: 'Guide speaking',
    preparing: 'Preparing audio',
    paused: 'Tour paused',
    waiting: 'Waiting for GPS',
    stale: 'Open tuur to update your position',
    staleStatus: 'Open tuur for an update',
    staleCompact: 'Open',
    choose: 'Choose your next stop in tuur',
    exploring: 'Looking for nearby stories',
    arrived: 'You have arrived',
    route: 'along route',
    routing: 'Finding a route',
    routeUnavailable: 'Open tuur to retry directions',
    compactPaused: 'Pause',
    compactListening: 'Audio',
    compactChoose: 'Choose',
    compactExplore: 'Roam',
    compactArrived: 'Here',
    completed: (count: number, total: number) => `${count} of ${total} stops done`,
    visited: (count: number) => `${count} ${count === 1 ? 'stop' : 'stops'} visited`,
  },
  de: {
    tour: 'Deine Tour',
    planned: 'Deine Route',
    fork: 'Weggabelung',
    roam: 'Streifzug',
    next: 'Nächste Station',
    listening: 'Erzählung läuft',
    preparing: 'Audio wird vorbereitet',
    paused: 'Tour pausiert',
    waiting: 'Warte auf GPS',
    stale: 'tuur öffnen, um den Standort zu aktualisieren',
    staleStatus: 'tuur für ein Update öffnen',
    staleCompact: 'Öffnen',
    choose: 'Nächste Station in tuur wählen',
    exploring: 'Suche nach Geschichten in der Nähe',
    arrived: 'Du bist angekommen',
    route: 'entlang der Route',
    routing: 'Route wird berechnet',
    routeUnavailable: 'Wegführung in tuur erneut laden',
    compactPaused: 'Pause',
    compactListening: 'Audio',
    compactChoose: 'Wählen',
    compactExplore: 'Suche',
    compactArrived: 'Hier',
    completed: (count: number, total: number) => `${count} von ${total} Stationen erledigt`,
    visited: (count: number) => `${count} ${count === 1 ? 'Station' : 'Stationen'} besucht`,
  },
};

// Content supplied by tours can be long. Bound it for the small system surfaces and ActivityKit payload.
function label(value: string | undefined): string {
  const text = Array.from((value ?? '').replace(/\s+/g, ' ').trim());
  return text.length > 90 ? `${text.slice(0, 89).join('')}…` : text.join('');
}

function shortDistance(meters: number, lang: string): string {
  // Quantisation avoids changing the island for every GPS metre and matches the player.
  if (meters >= 1000) return `${formatKm(meters, lang)} km`;
  const rounded = meters >= 100 ? Math.round(meters / 10) * 10 : Math.round(meters);
  return `${rounded} m`;
}

/** Builds a small, localised snapshot; the controller owns native start/update/end and freshness. */
export function buildLiveActivityContent(
  ui: GuideUi,
  options: LiveActivityOptions,
): LiveActivityContent | null {
  if (ui.phase === 'finished') return null;

  const lang = options.lang.toLowerCase().split(/[-_]/)[0] === 'de' ? 'de' : 'en';
  const t = copy[lang];
  const sessionTitle = label(options.title) || t[options.mode];
  const total = ui.stops.length;
  const visited = ui.stops.filter((stop) => stop.state === 'visited').length;
  const completed = ui.stops.filter((stop) => stop.state === 'visited' || stop.state === 'skipped').length;
  const openRoute = options.mode === 'fork' || options.mode === 'roam';
  const narrating = ui.phase === 'narrating';
  // awaitingRoute can retain the previous target in a snapshot. Never display it as the next stop.
  const target = ui.awaitingRoute ? undefined : ui.target;
  // The runtime can retain the previous narration while advancing to the next target.
  // Pair a distance with its own stop, never with the previous narration's title.
  const currentNarration =
    narrating && ui.narration?.kind === 'stop' && (!target || ui.narration.poiId === target.id)
      ? ui.narration
      : undefined;
  const meters = target ? options.navigation?.distanceM : undefined;
  const validDistance =
    !options.locationStale && meters !== undefined && Number.isFinite(meters) && meters >= 0;
  const distanceText = validDistance ? shortDistance(meters, lang) : '';
  const result: LiveActivityContent = {
    title: label(currentNarration?.title) || label(target?.name) || sessionTitle,
    subtitle: sessionTitle,
    status: t.next,
    distance: distanceText ? `${distanceText} · ${t.route}` : '',
    progress: openRoute ? t.visited(visited) : t.completed(completed, total),
    progressValue: total === 0 ? 0 : completed / total,
    symbol: 'location.fill',
    compactText: distanceText,
    staleStatus: t.staleStatus,
    staleCompact: t.staleCompact,
  };

  if (ui.phase === 'paused') {
    result.status = t.paused;
    result.symbol = 'pause.fill';
    result.compactText = t.compactPaused;
  } else if (narrating) {
    result.status = ui.playing ? t.listening : t.preparing;
    result.symbol = ui.playing ? 'speaker.wave.2.fill' : 'hourglass';
    result.compactText = t.compactListening;
  } else if (ui.awaitingRoute && options.mode === 'fork') {
    result.status = t.choose;
    result.symbol = 'arrow.triangle.branch';
    result.compactText = t.compactChoose;
  } else if (options.locationStale) {
    result.status = t.stale;
    result.symbol = 'location.slash';
    result.compactText = 'GPS';
  } else if (!ui.user && !validDistance) {
    result.status = t.waiting;
    result.symbol = 'location.slash';
    result.compactText = 'GPS';
  } else if (!target) {
    result.status = t.exploring;
    result.symbol = 'figure.walk';
    result.compactText = t.compactExplore;
  } else if (!validDistance) {
    const waitingLocation = options.navigation?.status === 'waiting_location';
    result.status = waitingLocation
      ? t.waiting
      : options.navigation?.status === 'error'
        ? t.routeUnavailable
        : t.routing;
    result.symbol = waitingLocation ? 'location.slash' : 'arrow.triangle.turn.up.right.diamond';
    result.compactText = waitingLocation ? 'GPS' : '…';
  } else if (target.distanceM !== undefined && target.distanceM < 25) {
    result.status = t.arrived;
    result.symbol = 'mappin.and.ellipse';
    result.compactText = t.compactArrived;
  }

  // Keep the audio/choice/paused status while making stale location explicit on expanded surfaces.
  if (options.locationStale && result.status !== t.stale) result.subtitle = t.stale;
  return result;
}

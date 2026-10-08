import {
  arrivalRadius,
  distanceMeters,
  initialGuideState,
  targetOf,
  updateTravel,
  type GuideCommand,
  type GuideEvent,
  type GuidePrefs,
  type GuideState,
  type StepResult,
} from '@tuur/shared';

/** A reading walk has GPS progress, but no narration readiness, playback or audio completion events. */
export function textGuideStep(previous: GuideState, event: GuideEvent, prefs: GuidePrefs): StepResult {
  let state: GuideState = { ...previous };
  const commands: GuideCommand[] = [];
  const advance = () => {
    state.index += 1;
    if (state.index < state.route.length) return;
    if (state.open) {
      state.awaitingRoute = true;
      commands.push({ type: 'needNext' });
    } else {
      state.finished = true;
      commands.push({ type: 'notice', code: 'finished' }, { type: 'finish' });
    }
  };
  switch (event.type) {
    case 'setRoute': {
      const ids = new Set(event.stops.map((stop) => stop.id));
      state = {
        ...initialGuideState(event.stops, event.startIndex ?? 0),
        travel: previous.travel,
        paused: previous.paused,
        visited: previous.visited.filter((id) => ids.has(id)),
        skipped: previous.skipped.filter((id) => ids.has(id)),
        reached: Object.fromEntries(Object.entries(previous.reached).filter(([id]) => ids.has(id))),
        waypointSent: Object.fromEntries(Object.entries(previous.waypointSent).filter(([id]) => ids.has(id))),
        open: event.open ?? previous.open,
      };
      state.awaitingRoute = state.open && state.index >= state.route.length;
      break;
    }
    case 'location':
      state.travel = updateTravel(previous.travel, event.fix);
      state.lastTs = event.fix.ts;
      break;
    case 'pause':
      state.paused = true;
      break;
    case 'resume':
      state.paused = false;
      break;
    case 'skip': {
      const target = targetOf(state);
      if (target) {
        if (!state.visited.includes(target.id)) state.skipped = [...state.skipped, target.id];
        advance();
      }
      break;
    }
    case 'previous':
      if (state.index > 0 || state.finished) {
        state.index = Math.max(0, (state.finished ? state.route.length : state.index) - 1);
        state.finished = false;
        state.awaitingRoute = false;
        const id = state.route[state.index]?.id;
        state.skipped = state.skipped.filter((item) => item !== id);
        state.reached = Object.fromEntries(Object.entries(state.reached).filter(([item]) => item !== id));
      }
      break;
    default:
      break;
  }
  // Audio callbacks arriving after a mode switch cannot change a text walk.
  delete state.playback;
  delete state.pending;
  delete state.pendingTransition;
  delete state.moreOffer;
  const here = state.travel.last;
  const target = targetOf(state);
  if (!here || !target || state.paused || state.awaitingRoute) return { state, commands };
  const distance = distanceMeters(here, target.location);
  const radius = arrivalRadius(prefs, state.travel.mode);
  if (distance <= radius) {
    if (target.navigationOnly) advance();
    else {
      state.reached = { ...state.reached, [target.id]: true };
      if (!state.visited.includes(target.id)) {
        state.visited = [...state.visited, target.id];
        commands.push({ type: 'visited', poiId: target.id });
      }
      if (state.open && !state.waypointSent[target.id]) {
        state.waypointSent = { ...state.waypointSent, [target.id]: true };
        commands.push({ type: 'waypoint', poiId: target.id });
      }
    }
  } else if (state.reached[target.id] && distance > radius * 1.3 && event.type === 'location') advance();
  return { state, commands };
}

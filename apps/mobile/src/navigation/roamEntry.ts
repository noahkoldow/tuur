export type RoamEntryState = 'location' | 'loading' | 'error' | 'missing' | 'locked' | 'ready' | 'starting';

/** Prerequisites for starting a place selected on Home. Access may arrive after returning from a paywall. */
export function roamEntryState(input: {
  hasPosition: boolean;
  ready: boolean;
  hasPlace: boolean;
  failed: boolean;
  unlocked: boolean;
  accessReady: boolean;
  starting: boolean;
}): RoamEntryState {
  if (input.starting) return 'starting';
  if (!input.hasPosition) return 'location';
  if (input.failed) return 'error';
  if (!input.ready) return 'loading';
  if (!input.hasPlace) return 'missing';
  if (!input.unlocked) return input.accessReady ? 'locked' : 'loading';
  return 'ready';
}

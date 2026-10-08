import { nextTourTimeMonth, type TourTimeResult, type UpdateTourTimeRequest } from '@tuur/shared';
import { BackendError } from '../backend/types';

type State = UpdateTourTimeRequest['state'];

/** Observe pause intent separately so metadata refreshes cannot undo an authorized resume. */
export function observeTourTime(
  runtime: {
    getState: () => { paused: boolean; finished: boolean };
    subscribe: (callback: () => void) => () => void;
    addPauseListener: (callback: () => void) => () => void;
  },
  time: TourTimeController,
) {
  let finished = false;
  const offPause = runtime.addPauseListener(() => time.pause());
  const checkFinished = () => {
    if (runtime.getState().finished && !finished) {
      finished = true;
      void time.stop().catch(() => undefined);
    }
  };
  const offState = runtime.subscribe(checkFinished);
  if (runtime.getState().paused) time.pause();
  checkFinished();
  return () => {
    offPause();
    offState();
  };
}

/** Keeps one server lease alive. Device timers never grant extra minutes. */
export class TourTimeController {
  private sequence = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private state: State = 'paused';
  private stopped = false;
  private result: TourTimeResult | undefined;

  constructor(
    private readonly deps: {
      request: Omit<UpdateTourTimeRequest, 'state' | 'sequence'>;
      update: (request: UpdateTourTimeRequest) => Promise<TourTimeResult>;
      isCurrent: () => boolean;
      onTime: (result: TourTimeResult) => void;
      onBlocked: (error: BackendError) => void;
      now?: () => number;
    },
  ) {}

  private now = () => (this.deps.now ?? Date.now)();

  async start(state: State = 'active') {
    await this.change(state);
    if (this.stopped) return;
    this.heartbeat = setInterval(() => {
      if (this.state === 'active') void this.change('active').catch(() => undefined);
      else if (this.state === 'paused' && this.result?.state === 'active')
        void this.change('paused').catch(() => undefined);
    }, 30_000);
  }

  async activate(): Promise<boolean> {
    try {
      await this.change('active');
      return (
        !this.stopped && this.deps.isCurrent() && this.state === 'active' && this.result?.state === 'active'
      );
    } catch {
      return false;
    }
  }

  pause() {
    if (this.state !== 'paused') void this.change('paused').catch(() => undefined);
  }

  /** Privacy dialogs wait until charging is paused on the server; never resumes implicitly. */
  async pauseAndWait(): Promise<void> {
    await this.change('paused');
  }

  async stop(preserveForRecovery = false) {
    if (this.stopped) return;
    clearInterval(this.heartbeat);
    clearTimeout(this.expiry);
    const ending = this.deps.isCurrent()
      ? this.change(preserveForRecovery ? 'paused' : 'ended')
      : Promise.resolve();
    this.stopped = true;
    await ending;
  }

  private change(state: State): Promise<void> {
    if ((this.stopped && state !== 'ended') || !this.deps.isCurrent()) return Promise.resolve();
    this.state = state;
    if (state !== 'active') clearTimeout(this.expiry);
    const work = this.tail
      .catch(() => undefined)
      .then(async () => {
        if (!this.deps.isCurrent()) return;
        if (state === 'active' && (this.stopped || this.state !== 'active')) return;
        // A new process can resume the saved ID without replaying a pre-crash sequence number.
        this.sequence = Math.max(this.sequence + 1, this.now());
        const request = { ...this.deps.request, sequence: this.sequence, state };
        const sentAt = this.now();
        try {
          let result: TourTimeResult;
          try {
            result = await this.deps.update(request);
          } catch (error) {
            if (!(error instanceof BackendError) || error.code !== 'network') throw error;
            // A lost response may already have committed. Re-use its sequence for the retry.
            result = await this.deps.update(request);
          }
          if (
            result.sequence > request.sequence &&
            !this.stopped &&
            this.deps.isCurrent() &&
            (state !== 'active' || this.state === 'active')
          ) {
            this.sequence = result.sequence + 1;
            result = await this.deps.update({ ...request, sequence: this.sequence });
          }
          if (!this.deps.isCurrent() || (this.stopped && state !== 'ended')) return;
          this.result = result;
          this.deps.onTime(result);
          if (state === 'active' && result.remainingSeconds === 0) {
            const error = new BackendError(
              'locked',
              'Tour time is used up',
              undefined,
              'tour_time_exhausted',
            );
            throw error;
          }
          if (state === 'active' && result.state !== 'active')
            throw new BackendError(
              'locked',
              'Resume the tour before continuing',
              undefined,
              'tour_time_required',
            );
          if (state === 'active' && this.state === 'active') this.armExpiry(result, this.now() - sentAt);
        } catch (error) {
          const e =
            error instanceof BackendError ? error : new BackendError('network', 'Could not check tour time');
          // An existing lease tolerates a brief network loss. It never tolerates extending its deadline.
          if (e.code !== 'network' || !this.result || this.result.state !== 'active') this.block(e);
          throw e;
        }
      });
    this.tail = work;
    return work;
  }

  private armExpiry(result: TourTimeResult, roundTripMs: number) {
    clearTimeout(this.expiry);
    if (result.leaseExpiresAt === null || result.remainingSeconds === null) return;
    const leaseMs = Math.max(0, result.leaseExpiresAt - result.serverNow - roundTripMs);
    // The server already caps the lease by available time. Its lease may also authorize the next
    // month's allowance; the old month's displayed remainder must not truncate that permission.
    const renewsDuringLease =
      result.source === 'subscription' && result.leaseExpiresAt > nextTourTimeMonth(result.serverNow);
    const exhausted =
      !renewsDuringLease &&
      result.remainingSeconds === Math.ceil((result.leaseExpiresAt - result.serverNow) / 1000);
    this.expiry = setTimeout(() => {
      if (this.stopped || this.state !== 'active' || !this.deps.isCurrent()) return;
      this.block(
        new BackendError(
          exhausted ? 'locked' : 'network',
          exhausted ? 'Tour time is used up' : 'Reconnect to continue the tour',
          undefined,
          exhausted ? 'tour_time_exhausted' : 'tour_time_lease_expired',
        ),
      );
      void this.change('paused').catch(() => undefined);
    }, leaseMs);
  }

  private block(error: BackendError) {
    if (this.stopped) return;
    this.state = 'paused';
    clearTimeout(this.expiry);
    this.deps.onBlocked(error);
  }
}

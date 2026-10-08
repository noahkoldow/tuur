import {
  SUBSCRIPTION_TOUR_MINUTES_PER_MONTH,
  UpdateTourTimeRequestSchema,
  activeTourSeconds,
  isSubscriber,
  tourTimeLeaseEnd,
  tourTimeMonthStart,
  tourTimeMonth,
  type AccessContext,
  type Entitlement,
  type TourTimeResult,
  type TourTimeSource,
  type UpdateTourTimeRequest,
} from '@tuur/shared';
import { BackendError } from './types';

type Context = AccessContext & { mode: UpdateTourTimeRequest['mode'] };
type Credit = Exclude<Entitlement, { type: 'subscription' }>;
type Funding = { source: TourTimeSource; grant?: Credit; expiresAt: number | null };
type Active = Context & {
  sessionId: string;
  funding: Funding;
  chargedThrough: number;
  leaseExpiresAt: number;
};
const same = (a: AccessContext, b: AccessContext) =>
  a.mode === b.mode && a.tourId === b.tourId && a.placeId === b.placeId;
const left = (grant: Credit) => grant.timeRemainingSeconds ?? grant.timeAllowanceSeconds ?? 0;
const metered = (source: TourTimeSource) => source === 'credit' || source === 'subscription';
const denied = (reason: string, message: string): never => {
  throw new BackendError('locked', message, undefined, reason);
};

/** In-memory counterpart of the server lease ledger, including replay protection and prepaid downloads. */
export function createDemoTimeBudget(
  entitlements: () => Entitlement[],
  now: () => number = () => Date.now(),
) {
  let month = tourTimeMonth(now());
  let usedSeconds = 0;
  let active: Active | null = null;
  const sessions = new Map<string, { context: Context; result: TourTimeResult }>();
  const downloads = new Map<string, Context>();

  const fundingFor = (context: AccessContext, paidOnly = false): Funding => {
    const grants = entitlements();
    const eligible = grants.filter((grant): grant is Credit => {
      if (grant.type === 'subscription') return false;
      const paidGift =
        grant.type === 'tour' && grant.source === 'invite' && grant.timeAllowanceSeconds === undefined;
      if (grant.source !== 'credit' && (paidOnly || !paidGift)) return false;
      if (grant.expiresAt !== null && grant.expiresAt <= now()) return false;
      if (context.mode === 'planned' || context.mode === 'fork' || context.mode === 'roam')
        return grant.type === 'session' && grant.placeId === context.placeId;
      return grant.type === 'tour' && grant.tourId === context.tourId;
    });
    const legacy = eligible.find((grant) => grant.timeAllowanceSeconds === undefined);
    if (legacy)
      return {
        source: 'legacy',
        grant: legacy,
        expiresAt: legacy.expiresAt,
      };
    const subscription = grants.find((grant) => isSubscriber([grant], now()));
    if (subscription) return { source: 'subscription', expiresAt: subscription.expiresAt };
    const credit = eligible.find((grant) => left(grant) > 0) ?? eligible[0];
    if (credit) return { source: 'credit', grant: credit, expiresAt: credit.expiresAt };
    return denied('denied', 'Tour is locked');
  };

  const settle = () => {
    const current = now();
    if (month !== tourTimeMonth(current)) {
      month = tourTimeMonth(current);
      usedSeconds = 0;
    }
    if (active) {
      const seconds = activeTourSeconds(active.chargedThrough, active.leaseExpiresAt, current);
      if (active.funding.source === 'subscription')
        usedSeconds += activeTourSeconds(
          Math.max(active.chargedThrough, tourTimeMonthStart(current)),
          active.leaseExpiresAt,
          current,
        );
      if (active.funding.source === 'credit' && active.funding.grant)
        active.funding.grant.timeRemainingSeconds = Math.max(0, left(active.funding.grant) - seconds);
      active.chargedThrough = Math.max(active.chargedThrough, Math.min(current, active.leaseExpiresAt));
      if (current >= active.leaseExpiresAt) active = null;
    }
  };
  const remaining = (funding: Funding): number | null =>
    funding.source === 'subscription'
      ? Math.max(0, SUBSCRIPTION_TOUR_MINUTES_PER_MONTH * 60 - usedSeconds)
      : funding.source === 'credit'
        ? left(funding.grant!)
        : null;

  return {
    update(raw: UpdateTourTimeRequest, context: Context, preview = false): TourTimeResult {
      const parsed = UpdateTourTimeRequestSchema.safeParse(raw);
      if (!parsed.success) return denied('invalid_request', 'Invalid tour time request');
      const request = parsed.data;
      const previous = sessions.get(request.sessionId);
      if (previous && !same(previous.context, context))
        return denied('session_conflict', 'Session id belongs to another tour');
      if (previous && request.sequence <= previous.result.sequence) return { ...previous.result };
      if (previous?.result.state === 'ended') return denied('tour_session_ended', 'Tour session has ended');
      settle();
      if (active && active.sessionId !== request.sessionId)
        return denied('tour_in_progress', 'Pause the active tour before starting another');
      const funding: Funding = preview ? { source: 'free', expiresAt: null } : fundingFor(context);
      const seconds = remaining(funding);
      const state = request.state === 'active' && seconds === 0 ? 'paused' : request.state;
      const current = now();
      const leaseExpiresAt =
        state === 'active' ? tourTimeLeaseEnd(current, funding.source, seconds, funding.expiresAt) : null;
      active =
        leaseExpiresAt === null
          ? null
          : {
              ...context,
              sessionId: request.sessionId,
              funding,
              chargedThrough: current,
              leaseExpiresAt,
            };
      const result: TourTimeResult = {
        sessionId: request.sessionId,
        sequence: request.sequence,
        source: funding.source,
        state,
        remainingSeconds: seconds === null ? null : Math.ceil(seconds),
        leaseExpiresAt,
        serverNow: current,
      };
      sessions.set(request.sessionId, { context: { ...context }, result });
      return { ...result };
    },
    assertAccess(context: AccessContext & { sessionId?: string; planning?: boolean }) {
      settle();
      const funding = fundingFor(context);
      if (!metered(funding.source)) return;
      if ((remaining(funding) ?? 0) <= 0) denied('tour_time_exhausted', 'Tour minutes exhausted');
      if (context.planning) return;
      const continuing =
        active?.mode === 'planned' &&
        context.mode === 'roam' &&
        !!context.placeId &&
        active.placeId === context.placeId;
      if (
        !active ||
        !context.sessionId ||
        active.sessionId !== context.sessionId ||
        (!continuing && (active.mode !== (context.mode ?? 'tour') || active.tourId !== context.tourId)) ||
        (context.placeId && active.placeId !== context.placeId)
      )
        denied('tour_time_required', 'Start or resume the tour before requesting content');
    },
    reserveDownload(context: Context, durationMinutes: number, scriptInstanceId?: string) {
      if (!metered(fundingFor(context, true).source)) return;
      if (!scriptInstanceId || !/^[A-Za-z0-9_-]{1,200}$/.test(scriptInstanceId))
        return denied('download_time_required', 'Download script instance required');
      const previous = downloads.get(scriptInstanceId);
      if (previous) {
        if (!same(previous, context)) denied('download_conflict', 'Download belongs to another tour');
        return;
      }
      settle();
      if (active && metered(active.funding.source))
        denied('tour_in_progress', 'Pause before preparing a download');
      const funding = fundingFor(context, true);
      const seconds = Math.ceil(durationMinutes * 60);
      if (!Number.isFinite(seconds) || seconds <= 0) denied('invalid_duration', 'Tour duration unavailable');
      if ((remaining(funding) ?? Infinity) < seconds)
        denied('tour_time_exhausted', 'Not enough tour minutes for this download');
      if (funding.source === 'subscription') usedSeconds += seconds;
      if (funding.source === 'credit' && funding.grant)
        funding.grant.timeRemainingSeconds = left(funding.grant) - seconds;
      downloads.set(scriptInstanceId, { ...context });
    },
    assertDownload(context: AccessContext & { downloadId?: string }) {
      if (!metered(fundingFor(context, true).source)) return;
      const reservation = context.downloadId ? downloads.get(context.downloadId) : undefined;
      if (!reservation || reservation.tourId !== context.tourId || reservation.mode !== context.mode)
        denied('download_time_required', 'Prepare the download first');
    },
    reset() {
      active = null;
      month = tourTimeMonth(now());
      usedSeconds = 0;
      sessions.clear();
      downloads.clear();
    },
  };
}

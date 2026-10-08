import { createHash } from 'node:crypto';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  EntitlementSchema,
  SUBSCRIPTION_TOUR_MINUTES_PER_MONTH,
  UpdateTourTimeRequestSchema,
  activeTourSeconds,
  isSubscriber,
  tourTimeLeaseEnd,
  tourTimeMonthStart,
  tourTimeMonth,
  type AccessContext,
  type Entitlement,
  type TourTimeSource,
  type UpdateTourTimeRequest,
  type UpdateTourTimeResult,
} from '@tuur/shared';
import type { BillingDeps } from './entitlements';
import { BillingError } from './errors';

type TimeContext = Pick<UpdateTourTimeRequest, 'mode' | 'tourId' | 'placeId'>;
interface Grant {
  id: string;
  ref: DocumentReference;
  entitlement: Entitlement;
}
interface Funding {
  source: TourTimeSource;
  grant?: Grant;
  expiresAt: number | null;
}
interface Active extends TimeContext {
  sessionId: string;
  source: TourTimeSource;
  entitlementId?: string;
  grantedAt?: number;
  chargedThrough: number;
  leaseExpiresAt: number;
}
interface Budget {
  month: string;
  usedSeconds: number;
  usageByAccount?: Record<string, number>;
  active: Active | null;
}
interface Session extends TimeContext {
  sequence: number;
  result: UpdateTourTimeResult;
}
const user = (db: Firestore, uid: string) => db.collection('users').doc(uid);
const budgetRef = (db: Firestore, uid: string) => user(db, uid).collection('tourTime').doc('budget');
const downloadRef = (db: Firestore, uid: string, id: string) =>
  user(db, uid).collection('tourDownloads').doc(createHash('sha256').update(id).digest('hex'));
const allowanceSeconds = SUBSCRIPTION_TOUR_MINUTES_PER_MONTH * 60;
const metered = (source: TourTimeSource) => source === 'subscription' || source === 'credit';
const remainingCredit = (grant: Grant): number => {
  const e = grant.entitlement;
  return e.type === 'subscription' ? 0 : (e.timeRemainingSeconds ?? e.timeAllowanceSeconds ?? 0);
};

async function readGrants(db: Firestore, uid: string, tx?: Transaction): Promise<Grant[]> {
  const collection = user(db, uid).collection('entitlements');
  const snapshot = tx ? await tx.get(collection) : await collection.get();
  return snapshot.docs.flatMap((doc) => {
    const parsed = EntitlementSchema.safeParse(doc.data());
    return parsed.success ? [{ id: doc.id, ref: doc.ref, entitlement: parsed.data }] : [];
  });
}

function fundingFor(grants: Grant[], ctx: AccessContext, now: number): Funding {
  const eligible = grants.filter(({ entitlement: e }) => {
    if (e.type === 'subscription') return false;
    if (
      e.type === 'tour' &&
      e.source !== 'credit' &&
      !(e.source === 'invite' && e.timeAllowanceSeconds === undefined)
    )
      return false;
    if (e.expiresAt !== null && e.expiresAt <= now) return false;
    if (ctx.mode === 'planned' || ctx.mode === 'fork' || ctx.mode === 'roam')
      return e.type === 'session' && e.placeId === ctx.placeId;
    return e.type === 'tour' && e.tourId === ctx.tourId;
  });
  // Legacy permanent purchases and their purchase-backed gifts keep their original online audio rights.
  const legacy = eligible.find(
    ({ entitlement: e }) => e.type !== 'subscription' && e.timeAllowanceSeconds === undefined,
  );
  if (legacy)
    return {
      source: 'legacy',
      grant: legacy,
      expiresAt: legacy.entitlement.expiresAt,
    };
  const subscription = grants.find(({ entitlement: e }) => isSubscriber([e], now));
  if (subscription) return { source: 'subscription', expiresAt: subscription.entitlement.expiresAt };
  const paid = eligible.find((grant) => remainingCredit(grant) > 0) ?? eligible[0];
  if (paid) return { source: 'credit', grant: paid, expiresAt: paid.entitlement.expiresAt };
  throw new BillingError('permission-denied', 'Tour is locked', {
    reason: 'audio_requires_purchase',
  });
}

/** Canonical places/tour identity are read from trusted documents, never inferred from client ownership claims. */
async function resolveContext(
  db: Firestore,
  uid: string,
  req: Partial<UpdateTourTimeRequest>,
  now: number,
  tx?: Transaction,
): Promise<AccessContext & TimeContext> {
  const read = async (ref: DocumentReference) => (tx ? tx.get(ref) : ref.get());
  const mode = req.mode ?? 'tour';
  if (mode === 'tour' || mode === 'planned') {
    if (!req.tourId || (mode === 'planned' && !req.tourId.startsWith('planned_')))
      throw new BillingError('invalid-argument', 'Tour id required');
    const ref =
      mode === 'planned'
        ? user(db, uid)
            .collection('sessions')
            .doc(req.tourId.replace(/^planned_/, ''))
        : db.collection('tours').doc(req.tourId);
    const snap = await read(ref);
    if (
      !snap.exists ||
      snap.get('locked') === true ||
      (mode === 'planned' && (snap.get('kind') !== 'planned' || !(Number(snap.get('expiresAt')) > now)))
    )
      throw new BillingError('not-found', 'Tour is no longer available');
    return {
      mode,
      tourId: req.tourId,
      placeId: String(snap.get('placeId') ?? ''),
      tourFree: snap.get('free') === true,
    };
  }
  let placeId = req.placeId;
  if (req.tile) {
    const area = await read(db.collection('areas').doc(req.tile));
    const canonicalPlace = area.get('placeId') as string | undefined;
    if (!canonicalPlace || (placeId && placeId !== canonicalPlace))
      throw new BillingError('permission-denied', 'Place does not match this area');
    placeId = canonicalPlace;
  } else if (placeId) {
    if (!(await read(db.collection('places').doc(placeId))).exists)
      throw new BillingError('not-found', 'Place not found');
  }
  if (!placeId) throw new BillingError('invalid-argument', 'Place required');
  return { mode, placeId };
}

function sameContext(a: TimeContext, b: TimeContext): boolean {
  return a.mode === b.mode && a.tourId === b.tourId && a.placeId === b.placeId;
}

/** Settle only confirmed lease time, charging each month its own portion of a crossing interval. */
function settle(raw: Budget | undefined, grants: Grant[], now: number, uid: string): Budget {
  const month = tourTimeMonth(now);
  const budget: Budget = raw ? structuredClone(raw) : { month, usedSeconds: 0, active: null };
  budget.usageByAccount ??= { [uid]: budget.usedSeconds };
  if (budget.month !== month) {
    budget.month = month;
    budget.usedSeconds = 0;
    budget.usageByAccount = {};
  }
  if (budget.active) {
    const active = budget.active;
    const seconds = activeTourSeconds(active.chargedThrough, active.leaseExpiresAt, now);
    if (active.source === 'subscription') {
      const currentMonthSeconds = activeTourSeconds(
        Math.max(active.chargedThrough, tourTimeMonthStart(now)),
        active.leaseExpiresAt,
        now,
      );
      budget.usedSeconds += currentMonthSeconds;
      budget.usageByAccount[uid] = (budget.usageByAccount[uid] ?? 0) + currentMonthSeconds;
    }
    if (active.source === 'credit') {
      const grant = grants.find(
        (g) =>
          g.id === active.entitlementId &&
          g.entitlement.type !== 'subscription' &&
          g.entitlement.grantedAt === active.grantedAt,
      );
      if (grant && grant.entitlement.type !== 'subscription')
        grant.entitlement.timeRemainingSeconds = Math.max(0, remainingCredit(grant) - seconds);
    }
    active.chargedThrough = Math.max(active.chargedThrough, Math.min(now, active.leaseExpiresAt));
    if (now >= active.leaseExpiresAt) budget.active = null;
  }
  return budget;
}

const remaining = (funding: Funding, budget: Budget): number | null =>
  funding.source === 'subscription'
    ? Math.max(0, allowanceSeconds - budget.usedSeconds)
    : funding.source === 'credit'
      ? remainingCredit(funding.grant!)
      : null;

function writeSettled(
  tx: Transaction,
  db: Firestore,
  uid: string,
  budget: Budget,
  grants: Grant[],
  now: number,
) {
  tx.set(budgetRef(db, uid), { ...budget, updatedAt: now });
  for (const grant of grants) {
    if (grant.entitlement.type !== 'subscription' && grant.entitlement.timeAllowanceSeconds !== undefined)
      tx.set(grant.ref, { timeRemainingSeconds: remainingCredit(grant) }, { merge: true });
  }
}

/** One active lease per account, serialized with the credit and subscription balances. */
export async function updateTourTime(
  deps: BillingDeps,
  uid: string,
  raw: unknown,
): Promise<UpdateTourTimeResult> {
  const parsed = UpdateTourTimeRequestSchema.safeParse(raw);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid tour time request');
  const req = parsed.data;
  const { db } = deps;
  return db.runTransaction(async (tx) => {
    const now = deps.now();
    const sessionRef = user(db, uid).collection('tourTimeSessions').doc(req.sessionId);
    const [grants, savedBudget, savedSession, ctx] = await Promise.all([
      readGrants(db, uid, tx),
      tx.get(budgetRef(db, uid)),
      tx.get(sessionRef),
      resolveContext(db, uid, req, now, tx),
    ]);
    const previous = savedSession.data() as Session | undefined;
    // Retained free/reward leases cannot be replayed to regain audio under the current policy.
    const funding = fundingFor(grants, ctx, now);
    if (previous && !sameContext(previous, ctx))
      throw new BillingError('already-exists', 'Session id belongs to another tour');
    if (previous && req.sequence <= previous.sequence) return previous.result;
    if (previous?.result.state === 'ended')
      throw new BillingError('failed-precondition', 'Tour session has ended', {
        reason: 'tour_session_ended',
      });
    const budget = settle(savedBudget.data() as Budget | undefined, grants, now, uid);
    if (budget.active && budget.active.sessionId !== req.sessionId)
      throw new BillingError('failed-precondition', 'Pause the active tour before starting another', {
        reason: 'tour_in_progress',
      });
    const seconds = remaining(funding, budget);
    const state = req.state === 'active' && seconds === 0 ? 'paused' : req.state;
    const leaseExpiresAt =
      state === 'active' ? tourTimeLeaseEnd(now, funding.source, seconds, funding.expiresAt) : null;
    budget.active =
      leaseExpiresAt === null
        ? null
        : {
            sessionId: req.sessionId,
            mode: ctx.mode,
            ...(ctx.tourId ? { tourId: ctx.tourId } : {}),
            ...(ctx.placeId ? { placeId: ctx.placeId } : {}),
            source: funding.source,
            ...(funding.grant
              ? {
                  entitlementId: funding.grant.id,
                  grantedAt:
                    funding.grant.entitlement.type === 'subscription'
                      ? 0
                      : funding.grant.entitlement.grantedAt,
                }
              : {}),
            chargedThrough: now,
            leaseExpiresAt,
          };
    const result: UpdateTourTimeResult = {
      sessionId: req.sessionId,
      sequence: req.sequence,
      source: funding.source,
      state,
      remainingSeconds: seconds === null ? null : Math.ceil(seconds),
      leaseExpiresAt,
      serverNow: now,
    };
    writeSettled(tx, db, uid, budget, grants, now);
    tx.set(sessionRef, {
      mode: ctx.mode,
      ...(ctx.tourId ? { tourId: ctx.tourId } : {}),
      ...(ctx.placeId ? { placeId: ctx.placeId } : {}),
      sequence: req.sequence,
      result,
    });
    return result;
  });
}

/** Enforce the active host lease before caches, LLM or TTS. No consumption is multiplied for group members. */
export async function assertTourTimeAccess(
  deps: BillingDeps,
  uid: string,
  request: {
    sessionId?: string;
    tourId?: string;
    mode?: TimeContext['mode'];
    placeId?: string;
    planning?: boolean;
  },
): Promise<void> {
  const now = deps.now();
  const [grants, saved] = await Promise.all([readGrants(deps.db, uid), budgetRef(deps.db, uid).get()]);
  const ctx: AccessContext = request;
  const funding = fundingFor(grants, ctx, now);
  if (!metered(funding.source)) return;
  const budget = settle(saved.data() as Budget | undefined, grants, now, uid);
  if (request.planning) {
    if ((remaining(funding, budget) ?? 0) > 0) return;
    throw new BillingError('resource-exhausted', 'Tour minutes exhausted', { reason: 'tour_time_exhausted' });
  }
  const active = budget.active;
  const continuingPlannedWalk =
    active?.mode === 'planned' &&
    request.mode === 'roam' &&
    !!request.placeId &&
    active.placeId === request.placeId;
  if (
    !active ||
    !request.sessionId ||
    active.sessionId !== request.sessionId ||
    (!continuingPlannedWalk &&
      (active.mode !== (request.mode ?? 'tour') || active.tourId !== request.tourId)) ||
    (request.placeId && active.placeId !== request.placeId) ||
    active.leaseExpiresAt <= now
  )
    throw new BillingError('permission-denied', 'Start or resume the tour before requesting content', {
      reason: 'tour_time_required',
    });
  if ((remaining(funding, budget) ?? 1) <= 0)
    throw new BillingError('resource-exhausted', 'Tour minutes exhausted', { reason: 'tour_time_exhausted' });
}

/** Reserve a fixed download once per script instance, so creating new offline variants cannot bypass the allowance. */
export async function reserveDownloadTime(
  deps: BillingDeps,
  uid: string,
  request: {
    tourId: string;
    mode: 'tour' | 'planned';
    placeId?: string;
    scriptInstanceId?: string;
    durationMinutes: number;
    stopIds: string[];
  },
): Promise<void> {
  const now = deps.now();
  const initial = await readGrants(deps.db, uid);
  if (!metered(fundingFor(initial, request, now).source)) return;
  if (!request.scriptInstanceId || !/^[A-Za-z0-9_-]{1,200}$/.test(request.scriptInstanceId))
    throw new BillingError('invalid-argument', 'Download script instance required');
  const ref = downloadRef(deps.db, uid, request.scriptInstanceId);
  await deps.db.runTransaction(async (tx) => {
    const [grants, saved, reservation] = await Promise.all([
      readGrants(deps.db, uid, tx),
      tx.get(budgetRef(deps.db, uid)),
      tx.get(ref),
    ]);
    if (reservation.exists) {
      if (reservation.get('tourId') !== request.tourId || reservation.get('mode') !== request.mode)
        throw new BillingError('already-exists', 'Download belongs to another tour');
      return;
    }
    const budget = settle(saved.data() as Budget | undefined, grants, now, uid);
    if (budget.active && metered(budget.active.source))
      throw new BillingError('failed-precondition', 'Pause the tour before preparing a download', {
        reason: 'tour_in_progress',
      });
    const funding = fundingFor(grants, request, now);
    const seconds = Math.ceil(request.durationMinutes * 60);
    if (!Number.isFinite(seconds) || seconds <= 0)
      throw new BillingError('failed-precondition', 'Tour duration unavailable');
    if ((remaining(funding, budget) ?? Infinity) < seconds)
      throw new BillingError('resource-exhausted', 'Not enough tour minutes for this download', {
        reason: 'tour_time_exhausted',
        requiredSeconds: seconds,
      });
    if (funding.source === 'subscription') {
      budget.usedSeconds += seconds;
      budget.usageByAccount![uid] = (budget.usageByAccount![uid] ?? 0) + seconds;
    }
    if (funding.source === 'credit' && funding.grant?.entitlement.type !== 'subscription')
      funding.grant!.entitlement.timeRemainingSeconds = remainingCredit(funding.grant!) - seconds;
    writeSettled(tx, deps.db, uid, budget, grants, now);
    tx.set(ref, {
      tourId: request.tourId,
      mode: request.mode,
      scriptInstanceId: request.scriptInstanceId,
      seconds,
      source: funding.source,
      createdAt: now,
      stopIds: request.stopIds,
    });
  });
}

export async function assertDownloadTimeAccess(
  deps: BillingDeps,
  uid: string,
  request: { tourId?: string; mode?: TimeContext['mode']; placeId?: string; downloadId?: string },
): Promise<void> {
  const grants = await readGrants(deps.db, uid);
  if (!metered(fundingFor(grants, request, deps.now()).source)) return;
  if (!request.downloadId)
    throw new BillingError('permission-denied', 'Prepare the download first', {
      reason: 'download_time_required',
    });
  const reservation = await downloadRef(deps.db, uid, request.downloadId).get();
  if (
    !reservation.exists ||
    reservation.get('tourId') !== request.tourId ||
    reservation.get('mode') !== request.mode
  )
    throw new BillingError('permission-denied', 'Prepare the download first', {
      reason: 'download_time_required',
    });
}

/** Each prepaid chapter has one immutable profile; modified titles, context or voices need a new download. */
export async function bindDownloadRecording(
  deps: BillingDeps,
  uid: string,
  request: {
    downloadId: string;
    slot: { poiId: string; lengthTier?: string; fromPoiId?: string };
    identity: string;
  },
): Promise<void> {
  const ref = downloadRef(deps.db, uid, request.downloadId);
  const slotKey = createHash('sha256').update(JSON.stringify(request.slot)).digest('hex');
  const identity = createHash('sha256').update(request.identity).digest('hex');
  await deps.db.runTransaction(async (tx) => {
    const reservation = await tx.get(ref);
    // Called only AFTER normal download authorization. Legacy permanent purchases need no reservation.
    if (!reservation.exists) return;
    const stopIds = reservation.get('stopIds') as string[] | undefined;
    const toIndex = stopIds?.indexOf(request.slot.poiId) ?? -1;
    if (
      toIndex < 0 ||
      (request.slot.fromPoiId && (toIndex === 0 || stopIds?.[toIndex - 1] !== request.slot.fromPoiId))
    )
      throw new BillingError('permission-denied', 'Recording is not part of the reserved itinerary', {
        reason: 'download_recording_mismatch',
      });
    const recordings = (reservation.get('recordings') ?? {}) as Record<string, string>;
    if (recordings[slotKey]) {
      if (recordings[slotKey] !== identity)
        throw new BillingError('permission-denied', 'A changed recording needs a new download', {
          reason: 'download_recording_mismatch',
        });
      return;
    }
    tx.set(ref, { recordings: { ...recordings, [slotKey]: identity } }, { merge: true });
  });
}

/** Merge monthly consumption when a store subscription moves accounts; restoring cannot refill its minutes. */
export async function readTourTimeTransfer(
  tx: Transaction,
  db: Firestore,
  uids: string[],
  now: number,
): Promise<() => void> {
  const snapshots = await Promise.all(uids.map((uid) => tx.get(budgetRef(db, uid))));
  const budgets = snapshots.map((snapshot, index) =>
    settle(snapshot.data() as Budget | undefined, [], now, uids[index]!),
  );
  const usageByAccount: Record<string, number> = {};
  for (const budget of budgets)
    for (const [owner, seconds] of Object.entries(budget.usageByAccount ?? {}))
      usageByAccount[owner] = Math.max(usageByAccount[owner] ?? 0, seconds);
  const usedSeconds = Object.values(usageByAccount).reduce((sum, seconds) => sum + seconds, 0);
  return () => {
    budgets.forEach((budget, index) => {
      // Credit grants are personal; their outstanding lease is settled on the next heartbeat.
      const raw = snapshots[index]!.data() as Budget | undefined;
      const active = raw?.active?.source === 'credit' ? raw.active : null;
      tx.set(budgetRef(db, uids[index]!), { ...budget, usageByAccount, usedSeconds, active, updatedAt: now });
    });
  };
}

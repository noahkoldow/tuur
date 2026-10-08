import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  GROUP_MAX_SIZE,
  GROUP_TTL_MS,
  GroupSchema,
  GroupAudioSchema,
  GroupRecordingSeedSchema,
  TourSchema,
  decideGroupAccess,
  decideJoin,
  groupCapacity,
  isSubscriber,
  parseGroupInvite,
  type Group,
  type Tour,
  resolvePersona,
} from '@tuur/shared';
import { authorizeContent, BillingError, loadEntitlements } from '../billing/entitlements';
import { consumePurchaseUnit } from '../billing/purchaseLedger';
import { consumeRateLimit } from '../util/rateLimit';
import { GroupAudioPendingError, seedGroupRecordings } from './recordings';
import { loadAiConfig } from '../util/aiConfig';

export interface GroupDeps {
  db: Firestore;
  now: () => number;
}

export class GroupError extends Error {
  constructor(
    readonly code:
      'invalid-argument' | 'not-found' | 'permission-denied' | 'failed-precondition' | 'resource-exhausted',
    message: string,
    readonly reason?: string,
  ) {
    super(message);
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const groups = (db: Firestore) => db.collection('groups');

/** What members (and the join screen) see; the invite hash never leaves the server. */
export function publicGroup(g: Group) {
  return {
    id: g.id,
    tour: g.tour,
    mode: g.mode,
    hostUid: g.hostUid,
    members: g.members.length,
    capacity: groupCapacity(g),
    status: g.status,
    expiresAt: g.expiresAt,
    ...(g.audio ? { audio: g.audio } : {}),
    ...(g.sessionId ? { sessionId: g.sessionId } : {}),
  };
}

async function loadTourForHost(
  db: Firestore,
  uid: string,
  tourId: string,
  mode: 'tour' | 'planned',
): Promise<Tour> {
  if (mode === 'planned') {
    const s = await db
      .collection('users')
      .doc(uid)
      .collection('sessions')
      .doc(tourId.replace(/^planned_/, ''))
      .get();
    const t = s.exists ? TourSchema.safeParse(s.data()) : undefined;
    if (!t?.success || t.data.id !== tourId) throw new GroupError('not-found', 'Tour not found');
    return t.data;
  }
  const s = await db.collection('tours').doc(tourId).get();
  const t = s.exists ? TourSchema.safeParse(s.data()) : undefined;
  if (!t?.success || t.data.locked) throw new GroupError('not-found', 'Tour not found');
  return t.data;
}

const CreateSchema = z.object({
  tourId: z.string().min(1).max(200),
  mode: z.enum(['tour', 'planned']),
  audio: GroupAudioSchema,
  sessionId: z.string().min(1).max(120).optional(),
  recordings: z.array(GroupRecordingSeedSchema).max(200).default([]),
});

/**
 * Host starts a live group for the tour they are allowed to play (checked like content access). Returns the
 * invite token `groupId.secret`; only its hash is stored, so the database alone cannot be used to join.
 */
export async function createGroup(deps: GroupDeps, uid: string, raw: unknown) {
  const p = CreateSchema.safeParse(raw);
  if (!p.success) throw new GroupError('invalid-argument', 'Invalid request');
  const now = deps.now();
  await consumeRateLimit(deps.db, `group_create_${uid}`, 10, 86_400_000, now).catch(() => {
    throw new GroupError('resource-exhausted', 'Too many groups today');
  });
  const tour = await loadTourForHost(deps.db, uid, p.data.tourId, p.data.mode);
  const first = tour.stops[0]!;
  const poi = await deps.db.collection('pois').doc(first.poiId).get();
  await authorizeContent(deps, uid, {
    tourId: tour.id,
    mode: p.data.mode,
    poiIds: [first.poiId],
    tile: poi.get('tile') as string | undefined,
    ...(p.data.sessionId ? { sessionId: p.data.sessionId } : {}),
  });
  const cfg = await loadAiConfig(deps.db, now);
  const voice = resolvePersona(cfg.voiceCast, cfg.defaultVoiceId, p.data.audio.voice).id;
  // one live group per host: an older one ends (its guests lose access)
  const open = await groups(deps.db).where('hostUid', '==', uid).where('status', '==', 'live').get();
  const batch = deps.db.batch();
  open.docs.forEach((d) => batch.update(d.ref, { status: 'ended' }));
  const ref = groups(deps.db).doc();
  const secret = randomBytes(32).toString('base64url');
  const group: Group = GroupSchema.parse({
    id: ref.id,
    hostUid: uid,
    tour,
    mode: p.data.mode,
    audio: { ...p.data.audio, voice },
    ...(p.data.sessionId ? { sessionId: p.data.sessionId } : {}),
    members: [uid],
    hostSubscriber: isSubscriber(await loadEntitlements(deps.db, uid), now),
    extraSeats: 0,
    inviteHash: sha256(secret),
    status: 'live',
    createdAt: now,
    expiresAt: now + GROUP_TTL_MS,
  });
  batch.set(ref, { ...group, expireAt: new Date(group.expiresAt + 7 * 86_400_000) });
  await batch.commit();
  await seedGroupRecordings(deps, group, p.data.recordings, cfg.defaultVoiceId);
  return { token: `${ref.id}.${secret}`, group: publicGroup(group) };
}

const JoinSchema = z.object({ token: z.string().min(10).max(200) });

/** Guest joins with the shared link; capacity and validity are decided inside one transaction. */
export async function joinGroup(deps: GroupDeps, uid: string, raw: unknown) {
  const p = JoinSchema.safeParse(raw);
  const parsed = p.success ? parseGroupInvite(p.data.token) : undefined;
  if (!parsed) throw new GroupError('invalid-argument', 'Invalid invite');
  const now = deps.now();
  await consumeRateLimit(deps.db, `group_join_${uid}`, 20, 3600_000, now).catch(() => {
    throw new GroupError('resource-exhausted', 'Too many attempts');
  });
  const ref = groups(deps.db).doc(parsed.groupId);
  return deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const g = snap.exists ? GroupSchema.safeParse(snap.data()) : undefined;
    const given = Buffer.from(sha256(parsed.secret), 'hex');
    const stored = g?.success ? Buffer.from(g.data.inviteHash, 'hex') : Buffer.alloc(given.length);
    if (!g?.success || stored.length !== given.length || !timingSafeEqual(stored, given))
      throw new GroupError('not-found', 'Invite not valid');
    const d = decideJoin(g.data, uid, now);
    if (!d.ok) throw new GroupError('failed-precondition', 'Cannot join', d.reason);
    if (!d.alreadyMember) tx.update(ref, { members: FieldValue.arrayUnion(uid) });
    return {
      group: publicGroup({ ...g.data, members: d.alreadyMember ? g.data.members : [...g.data.members, uid] }),
    };
  });
}

const GroupIdSchema = z.object({ groupId: z.string().regex(/^[A-Za-z0-9]{10,40}$/) });

/** Host spends one bought seat credit for one more place (never beyond GROUP_MAX_SIZE). */
export async function addGroupSeat(deps: GroupDeps, uid: string, raw: unknown) {
  const p = GroupIdSchema.extend({
    // Optional for older clients. New clients persist this before spending a credit or opening StoreKit.
    requestId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{10,120}$/)
      .optional(),
  }).safeParse(raw);
  if (!p.success) throw new GroupError('invalid-argument', 'Invalid request');
  const ref = groups(deps.db).doc(p.data.groupId);
  const walletRef = deps.db.collection('users').doc(uid).collection('credits').doc('wallet');
  return deps.db.runTransaction(async (tx) => {
    const [snap, wallet] = await Promise.all([tx.get(ref), tx.get(walletRef)]);
    const g = snap.exists ? GroupSchema.safeParse(snap.data()) : undefined;
    if (!g?.success || g.data.hostUid !== uid) throw new GroupError('not-found', 'Group not found');
    const seats = Number(wallet.get('seatBalance') ?? 0);
    const requests = z.array(z.string()).parse(snap.get('seatRequestIds') ?? []);
    // A lost response can be replayed after the group has ended, without spending another credit.
    if (p.data.requestId && requests.includes(p.data.requestId))
      return { capacity: groupCapacity(g.data), seatBalance: seats };
    if (g.data.status !== 'live' || g.data.expiresAt <= deps.now())
      throw new GroupError('failed-precondition', 'Group ended', 'ended');
    if (groupCapacity(g.data) >= GROUP_MAX_SIZE)
      throw new GroupError('failed-precondition', 'Group is at its maximum size', 'max_size');
    if (seats < 1) throw new GroupError('failed-precondition', 'No seat credit', 'no_seat_credit');
    const consume = await consumePurchaseUnit(tx, deps.db, uid, 'seat', seats, deps.now());
    consume();
    tx.set(walletRef, { seatBalance: seats - 1 }, { merge: true });
    tx.set(
      ref,
      {
        extraSeats: g.data.extraSeats + 1,
        ...(p.data.requestId ? { seatRequestIds: [...requests, p.data.requestId] } : {}),
      },
      { merge: true },
    );
    return {
      capacity: groupCapacity({ ...g.data, extraSeats: g.data.extraSeats + 1 }),
      seatBalance: seats - 1,
    };
  });
}

/** A guest leaves; when the host leaves, the group ends for everyone. */
export async function leaveGroup(deps: GroupDeps, uid: string, raw: unknown) {
  const p = GroupIdSchema.safeParse(raw);
  if (!p.success) throw new GroupError('invalid-argument', 'Invalid request');
  const ref = groups(deps.db).doc(p.data.groupId);
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    if (snap.get('hostUid') === uid) tx.update(ref, { status: 'ended' });
    else tx.update(ref, { members: FieldValue.arrayRemove(uid) });
  });
  return { ok: true };
}

/** Content access through a live group (used by the narration authorization before paid generation). */
export async function hasGroupAccess(
  deps: GroupDeps,
  uid: string,
  groupId: string,
  req: { poiIds: string[]; download?: boolean },
): Promise<boolean> {
  return Boolean(await authorizedGroup(deps, uid, groupId, req));
}

/** Membership and the host's current time lease are checked on every shared recording request. */
export async function authorizedGroup(
  deps: GroupDeps,
  uid: string,
  groupId: string,
  req: { poiIds: string[]; download?: boolean; waitForHost?: boolean },
): Promise<Group | undefined> {
  if (!/^[A-Za-z0-9]{10,40}$/.test(groupId)) return undefined;
  const snap = await groups(deps.db).doc(groupId).get();
  const g = snap.exists ? GroupSchema.safeParse(snap.data()) : undefined;
  if (
    g?.success &&
    g.data.hostSubscriber &&
    !isSubscriber(await loadEntitlements(deps.db, g.data.hostUid), deps.now())
  )
    return undefined;
  if (!g?.success || !decideGroupAccess(g.data, uid, req, deps.now())) return undefined;
  try {
    await authorizeContent(deps, g.data.hostUid, {
      tourId: g.data.tour.id,
      mode: g.data.mode,
      poiIds: req.poiIds,
      ...(g.data.sessionId ? { sessionId: g.data.sessionId } : {}),
    });
  } catch (error) {
    if (error instanceof BillingError) {
      if (
        req.waitForHost &&
        uid !== g.data.hostUid &&
        ['tour_time_required', 'tour_time_exhausted'].includes(String(error.details?.['reason']))
      )
        throw new GroupAudioPendingError();
      return undefined;
    }
    throw error;
  }
  return g.data;
}

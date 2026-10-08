import { z } from 'zod';
import { TourSchema } from '../routing/tour';
import { TourScriptSchema } from '../narration/script';
import { NarrationLangSchema } from '../narration/types';
import { INTERESTS } from '../constants';

/**
 * Live group tours (owner decision 2026-09-30, D47): the host shares a link, up to two friends join and run the same
 * tour on their own phones without paying. Membership is checked by the server on every content request, so it only
 * works online and ends with the group. Bigger groups: premium hosts get two more places, anyone can buy extra seats.
 */
export const GROUP_BASE_SIZE = 3; // host + 2 friends
export const GROUP_PREMIUM_EXTRA = 2;
export const GROUP_MAX_SIZE = 8;
export const GROUP_TTL_MS = 12 * 3600_000;
/** Store product for one extra seat (consumable, about 0.49 EUR; see docs/UNIT_ECONOMICS.md). */
export const GROUP_SEAT_PRODUCT = 'tuur_group_seat';

/** One editorial brief and voice for the people walking together. */
export const GroupAudioSchema = z.object({
  script: TourScriptSchema.extend({ instanceId: z.string().min(1).max(120) }),
  lang: NarrationLangSchema,
  voice: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,30}$/)
    .optional(),
  primaryInterest: z.enum(INTERESTS).optional(),
});
export type GroupAudio = z.infer<typeof GroupAudioSchema>;

export const GroupRecordingSeedSchema = z.object({
  kind: z.enum(['narration', 'transition']),
  key: z.string().regex(/^personal__[a-f0-9]{64}$/),
  poiId: z.string().min(1).max(120),
  fromPoiId: z.string().min(1).max(120).optional(),
});
export type GroupRecordingSeed = z.infer<typeof GroupRecordingSeedSchema>;

export const GroupSchema = z.object({
  id: z.string(),
  hostUid: z.string(),
  /** Tour snapshot the group walks (standard or planned tour); guests never need their own access to it. */
  tour: TourSchema,
  mode: z.enum(['tour', 'planned']),
  /** Older group records remain readable, but cannot generate separate guest recordings. */
  audio: GroupAudioSchema.optional(),
  /** Only this host session consumes tour minutes. */
  sessionId: z.string().min(1).max(120).optional(),
  members: z.array(z.string()).min(1),
  hostSubscriber: z.boolean(),
  extraSeats: z.number().int().nonnegative(),
  /** sha256 of the invite secret; the secret itself only exists in the shared link. */
  inviteHash: z.string(),
  status: z.enum(['live', 'ended']),
  createdAt: z.number(),
  expiresAt: z.number(),
});
export type Group = z.infer<typeof GroupSchema>;

export function groupCapacity(g: Pick<Group, 'hostSubscriber' | 'extraSeats'>): number {
  return Math.min(
    GROUP_MAX_SIZE,
    GROUP_BASE_SIZE + (g.hostSubscriber ? GROUP_PREMIUM_EXTRA : 0) + g.extraSeats,
  );
}

export const isGroupLive = (g: Pick<Group, 'status' | 'expiresAt'>, now: number) =>
  g.status === 'live' && g.expiresAt > now;

export type JoinDecision =
  { ok: true; alreadyMember: boolean } | { ok: false; reason: 'ended' | 'full' | 'own_group' };

/** Join check, evaluated inside the server transaction (capacity can never be exceeded by parallel joins). */
export function decideJoin(g: Group, uid: string, now: number): JoinDecision {
  if (!isGroupLive(g, now)) return { ok: false, reason: 'ended' };
  if (g.hostUid === uid) return { ok: false, reason: 'own_group' };
  if (g.members.includes(uid)) return { ok: true, alreadyMember: true };
  if (g.members.length >= groupCapacity(g)) return { ok: false, reason: 'full' };
  return { ok: true, alreadyMember: false };
}

/**
 * Content access through a group: only members of a live group, only for stops of the group's tour and never for
 * offline downloads (the free ride stops when the group ends).
 */
export function decideGroupAccess(
  g: Group,
  uid: string,
  req: { poiIds: string[]; download?: boolean },
  now: number,
): boolean {
  if (!isGroupLive(g, now) || !g.members.includes(uid) || req.download) return false;
  const stops = new Set(g.tour.stops.map((s) => s.poiId));
  return req.poiIds.length > 0 && req.poiIds.every((id) => stops.has(id));
}

/** Invite links carry `groupId.secret`; parsing is strict so malformed links never reach Firestore. */
export function parseGroupInvite(token: string): { groupId: string; secret: string } | undefined {
  const m = /^([A-Za-z0-9]{10,40})\.([A-Za-z0-9_-]{32,64})$/.exec(token.trim());
  return m ? { groupId: m[1]!, secret: m[2]! } : undefined;
}

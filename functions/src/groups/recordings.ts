import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { NarrationDocSchema, type Group, type GroupRecordingSeed, type NarrationDoc } from '@tuur/shared';
import { z } from 'zod';

const GroundingSchema = z.object({
  queries: z.number(),
  searchEntryPointHtml: z.string().optional(),
  sources: z.array(z.object({ uri: z.string(), title: z.string().optional() })),
});
const RecordingSchema = z.object({ doc: NarrationDocSchema, grounding: GroundingSchema.optional() });
export type GroupRecording = z.infer<typeof RecordingSchema>;
type Deps = { db: Firestore; now: () => number };
type Slot = { poiId: string; fromPoiId?: string };

export class GroupAudioPendingError extends Error {
  readonly code = 'unavailable';
  readonly details = { reason: 'group_audio_pending', retryAfterMs: 1500 };
  constructor() {
    super('Waiting for the host recording');
  }
}

/** Length, voice, language and guest context deliberately do not create a second recording slot. */
export function groupRecordingId(slot: Slot) {
  return createHash('sha256')
    .update(JSON.stringify([slot.fromPoiId ?? null, slot.poiId]))
    .digest('hex');
}
const refFor = (db: Firestore, group: Group, slot: Slot) =>
  db.collection('groups').doc(group.id).collection('recordings').doc(groupRecordingId(slot));
const expires = (group: Group) => ({ expireAt: new Date(group.expiresAt + 7 * 86_400_000) });

export const narrationDocRef = (db: Firestore, uid: string, key: string, grounded: boolean) =>
  grounded
    ? db.collection('users').doc(uid).collection('groundedNarrations').doc(key)
    : db.collection('narrations').doc(key);

function matches(group: Group, slot: Slot, doc: NarrationDoc, now: number) {
  return Boolean(
    group.audio &&
    doc.ownerUid === group.hostUid &&
    doc.scriptInstanceId === group.audio.script.instanceId &&
    doc.lang === group.audio.lang &&
    doc.poiId === slot.poiId &&
    doc.status === 'ok' &&
    (slot.fromPoiId
      ? doc.primaryInterest === 'transition' && doc.transitionFromPoiId === slot.fromPoiId
      : doc.primaryInterest !== 'transition') &&
    (!doc.grounded || (doc.groundedExpiresAt ?? 0) > now),
  );
}

async function published(deps: Deps, group: Group, slot: Slot): Promise<GroupRecording | undefined> {
  const snapshot = await refFor(deps.db, group, slot).get();
  const record = snapshot.exists ? RecordingSchema.safeParse(snapshot.data()) : undefined;
  if (!record?.success || !matches(group, slot, record.data.doc, deps.now())) return undefined;
  // A report, owner deletion or replacement also revokes previously published group references.
  const current = await narrationDocRef(
    deps.db,
    group.hostUid,
    record.data.doc.key,
    record.data.doc.grounded,
  ).get();
  const doc = current.exists ? NarrationDocSchema.safeParse(current.data()) : undefined;
  if (
    !doc?.success ||
    !matches(group, slot, doc.data, deps.now()) ||
    doc.data.createdAt !== record.data.doc.createdAt ||
    doc.data.text !== record.data.doc.text
  )
    return undefined;
  return record.data;
}

/** Guests can only read. A lease also prevents simultaneous host prefetches from buying duplicate audio. */
export async function sharedGroupRecording(
  deps: Deps,
  group: Group,
  uid: string,
  slot: Slot,
  generate: () => Promise<GroupRecording>,
): Promise<GroupRecording> {
  const existing = await published(deps, group, slot);
  if (existing) return existing;
  // A host request can finish after the invitation snapshot, while already cached on the host's phone.
  // Recover its server-owned result; a guest can publish an existing recording but never generate one.
  const recovered = await recoverHostRecording(deps, group, slot);
  if (recovered) return recovered;
  if (uid !== group.hostUid || !group.audio) throw new GroupAudioPendingError();
  const ref = refFor(deps.db, group, slot);
  const lease = randomUUID();
  const acquired = await deps.db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (Number(snapshot.get('leaseExpiresAt') ?? 0) > deps.now()) return false;
    tx.set(ref, { lease, leaseExpiresAt: deps.now() + 6 * 60_000, ...expires(group) }, { merge: true });
    return true;
  });
  if (!acquired) throw new GroupAudioPendingError();
  try {
    const late = await published(deps, group, slot);
    if (late) return late;
    const recording = await generate();
    if (!matches(group, slot, recording.doc, deps.now())) throw new GroupAudioPendingError();
    await deps.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.get('lease') !== lease) throw new GroupAudioPendingError();
      tx.set(ref, { ...recording, leaseExpiresAt: 0, ...expires(group) });
    });
    return recording;
  } finally {
    await deps.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.get('lease') === lease) tx.set(ref, { leaseExpiresAt: 0 }, { merge: true });
    });
  }
}

async function storedRecording(
  deps: Deps,
  group: Group,
  slot: Slot,
  ref: FirebaseFirestore.DocumentReference,
  defaultVoice?: string,
): Promise<GroupRecording | undefined> {
  const snapshot = await ref.get();
  const parsed = snapshot.exists ? NarrationDocSchema.safeParse(snapshot.data()) : undefined;
  if (!parsed?.success || !matches(group, slot, parsed.data, deps.now())) return undefined;
  let doc = parsed.data;
  // Older grounded records do not contain their attribution. Only a host response can republish them.
  if (doc.grounded && !doc.grounding) return undefined;
  const voice = group.audio?.voice ?? defaultVoice;
  if (voice && (doc.voiceId ?? defaultVoice) !== voice) {
    const variant = await ref.collection('voices').doc(voice).get();
    const audio = z
      .object({
        voiceId: z.string(),
        audioPath: z.string(),
        paragraphs: NarrationDocSchema.shape.paragraphs,
        audioDurationMs: z.number(),
        audioMimeType: z.string(),
      })
      .safeParse(variant.data());
    if (!audio.success || audio.data.voiceId !== voice) return undefined;
    doc = { ...doc, ...audio.data };
  }
  return { doc, ...(doc.grounding ? { grounding: doc.grounding } : {}) };
}

async function recoverHostRecording(
  deps: Deps,
  group: Group,
  slot: Slot,
): Promise<GroupRecording | undefined> {
  if (!group.audio) return undefined;
  const collections = [
    deps.db.collection('narrations'),
    deps.db.collection('users').doc(group.hostUid).collection('groundedNarrations'),
  ];
  const candidates = (
    await Promise.all(
      collections.map((collection) =>
        collection
          .where('ownerUid', '==', group.hostUid)
          .where('scriptInstanceId', '==', group.audio!.script.instanceId)
          .where('poiId', '==', slot.poiId)
          .limit(100)
          .get(),
      ),
    )
  )
    .flatMap((snapshot) => snapshot.docs)
    .sort((a, b) => Number(b.get('createdAt')) - Number(a.get('createdAt')) || a.id.localeCompare(b.id));
  for (const candidate of candidates) {
    const recording = await storedRecording(deps, group, slot, candidate.ref);
    if (!recording) continue;
    const ref = refFor(deps.db, group, slot);
    await deps.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (Number(snapshot.get('leaseExpiresAt') ?? 0) > deps.now()) return;
      if (snapshot.get('doc')) return;
      tx.set(ref, { ...recording, ...expires(group) });
    });
    return published(deps, group, slot);
  }
  return undefined;
}

/** Bind already heard host chapters when inviting mid-tour, without trusting client audio paths. */
export async function seedGroupRecordings(
  deps: Deps,
  group: Group,
  seeds: GroupRecordingSeed[],
  defaultVoice: string,
): Promise<void> {
  if (!group.audio) return;
  const stopIds = new Set(group.tour.stops.map((stop) => stop.poiId));
  for (const seed of seeds) {
    const slot: Slot = {
      poiId: seed.poiId,
      ...(seed.kind === 'transition' && seed.fromPoiId ? { fromPoiId: seed.fromPoiId } : {}),
    };
    if (
      !stopIds.has(slot.poiId) ||
      (seed.kind === 'transition' && (!slot.fromPoiId || !stopIds.has(slot.fromPoiId)))
    )
      continue;
    for (const grounded of [false, true]) {
      const recording = await storedRecording(
        deps,
        group,
        slot,
        narrationDocRef(deps.db, group.hostUid, seed.key, grounded),
        defaultVoice,
      );
      if (recording) {
        await refFor(deps.db, group, slot).set({ ...recording, ...expires(group) });
        break;
      }
    }
  }
}

/** Snapshot exactly the host response, including voice timings, while retaining validated owner metadata. */
export async function recordingFromResponse(
  deps: Deps,
  group: Group,
  response: Pick<NarrationDoc, 'key' | 'audioPath' | 'audioDurationMs' | 'paragraphs'> & {
    grounding?: GroupRecording['grounding'];
  },
): Promise<GroupRecording> {
  const grounded = response.audioPath.startsWith('narrations-grounded/');
  const snapshot = await narrationDocRef(deps.db, group.hostUid, response.key, grounded).get();
  const doc = NarrationDocSchema.parse(snapshot.data());
  return {
    doc: {
      ...doc,
      audioPath: response.audioPath,
      audioDurationMs: response.audioDurationMs,
      paragraphs: response.paragraphs,
    },
    ...(response.grounding ? { grounding: response.grounding } : {}),
  };
}

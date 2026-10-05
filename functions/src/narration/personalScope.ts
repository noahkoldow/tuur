import { createHash, randomUUID } from 'node:crypto';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** The authenticated owner participates in identity; a client-supplied script ID is never authority. */
export function personalNarrationScope(uid: string, instanceId?: string) {
  // Older clients have no persistent script identity. Generate afresh rather than reuse a shared recording.
  const scriptInstanceId = instanceId ?? randomUUID();
  return {
    ownerUid: uid,
    scriptInstanceId,
    key: (contentKey: string) => `personal__${hash(JSON.stringify([uid, scriptInstanceId, contentKey]))}`,
  };
}

export const personalAudioPrefix = (uid: string) => `narrations-personal/${hash(uid)}/`;

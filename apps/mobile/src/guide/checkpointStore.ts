import { SessionCheckpointSchema, type SessionCheckpoint } from '@tuur/shared';

export interface CheckpointStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}
const KEY = 'tuur.session.v1';
const MAX_AGE_MS = 24 * 60 * 60_000;

/** Serialize disk operations so a late save cannot resurrect a discarded/deleted session. */
export class SessionCheckpointStore {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: CheckpointStorage) {}

  async save(checkpoint: SessionCheckpoint): Promise<void> {
    const json = JSON.stringify(SessionCheckpointSchema.parse(checkpoint));
    const write = this.writes.catch(() => undefined).then(() => this.storage.setItem(KEY, json));
    this.writes = write;
    return write.then(() => undefined);
  }

  clear(): Promise<void> {
    const write = this.writes.catch(() => undefined).then(() => this.storage.removeItem(KEY));
    this.writes = write;
    return write.then(() => undefined);
  }

  async load(ownerUid: string, now = Date.now()): Promise<SessionCheckpoint | undefined> {
    await this.writes.catch(() => undefined);
    const json = await this.storage.getItem(KEY);
    if (!json) return undefined;
    try {
      const parsed = SessionCheckpointSchema.safeParse(JSON.parse(json));
      if (!parsed.success) return undefined;
      const data = parsed.data;
      if (data.ownerUid !== ownerUid || now - data.savedAt > MAX_AGE_MS || data.savedAt > now + 60_000)
        return undefined;
      return data;
    } catch {
      return undefined;
    }
  }
}

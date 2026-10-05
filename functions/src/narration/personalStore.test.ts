import { describe, expect, it, vi } from 'vitest';
import { memoryFirestore } from '../../test/memoryFirestore';
import { deletePersonalNarrations } from './personalStore';
import { personalAudioPrefix } from './personalScope';

describe('personal recording account deletion', () => {
  it('removes only the owner recordings, every voice subcollection and the owner audio prefix', async () => {
    const { db, docs } = memoryFirestore();
    for (let i = 0; i < 105; i++) {
      docs.set(`narrations/personal-${i}`, { ownerUid: 'owner' });
      docs.set(`narrations/personal-${i}/voices/mara`, { audioPath: 'personal-audio' });
    }
    docs.set('narrations/other', { ownerUid: 'owner-other' });
    docs.set('narrations/legacy', { text: 'Previously shared content' });
    db.recursiveDelete = vi.fn(async (ref) => {
      for (const path of docs.keys())
        if (path === ref.path || path.startsWith(`${ref.path}/`)) docs.delete(path);
    });
    const removeAudio = vi.fn(async () => undefined);
    expect(await deletePersonalNarrations(db, 'owner', removeAudio)).toBe(105);
    expect(removeAudio).toHaveBeenCalledExactlyOnceWith(personalAudioPrefix('owner'));
    expect(personalAudioPrefix('owner')).not.toBe(personalAudioPrefix('owner-other'));
    expect([...docs.keys()]).toEqual(['narrations/other', 'narrations/legacy']);
  });
});

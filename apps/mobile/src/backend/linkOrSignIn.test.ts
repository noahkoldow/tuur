import { describe, expect, it, vi } from 'vitest';
import { linkOrSignIn } from './linkOrSignIn';

describe('link or sign in', () => {
  it('keeps a new identity and purchases on the anonymous account', async () => {
    const signIn = vi.fn();
    const link = vi.fn().mockResolvedValue({ uid: 'guest' });
    await expect(linkOrSignIn({ anonymous: true, credential: 'token', link, signIn })).resolves.toEqual({
      uid: 'guest',
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it('signs into an existing identity with a fresh Apple credential, without merging accounts', async () => {
    const link = vi.fn().mockRejectedValue({ code: 'auth/credential-already-in-use' });
    const signIn = vi.fn().mockResolvedValue({ uid: 'existing' });
    const refreshCredential = vi.fn().mockResolvedValue('fresh');
    await expect(
      linkOrSignIn({ anonymous: true, credential: 'used', link, signIn, refreshCredential }),
    ).resolves.toEqual({ uid: 'existing' });
    expect(link).toHaveBeenCalledWith('used');
    expect(signIn).toHaveBeenCalledWith('fresh');
    expect(refreshCredential).toHaveBeenCalledOnce();
  });

  it('does not change accounts for network errors or a different provider using the same email', async () => {
    for (const code of ['auth/network-request-failed', 'auth/account-exists-with-different-credential']) {
      const error = { code };
      const signIn = vi.fn();
      await expect(
        linkOrSignIn({
          anonymous: true,
          credential: 'token',
          link: vi.fn().mockRejectedValue(error),
          signIn,
        }),
      ).rejects.toBe(error);
      expect(signIn).not.toHaveBeenCalled();
    }
  });
});

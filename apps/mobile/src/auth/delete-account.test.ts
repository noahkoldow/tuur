import { describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '../backend/types';
import { deleteAccountWithAppleRevocation } from './delete-account';

function setup(providerIds = ['apple.com']) {
  let current: UserInfo | null = { uid: 'owner', isAnonymous: false, providerIds };
  const order: string[] = [];
  const deps = {
    current: () => current,
    reauthenticateApple: vi.fn(async () => {
      order.push('authenticate');
      return 'fresh-code';
    }),
    revokeApple: vi.fn(async (_token: string) => {
      order.push('revoke');
    }),
    deleteData: vi.fn(async () => {
      order.push('delete');
    }),
    signOut: vi.fn(async () => {
      order.push('signOut');
    }),
  };
  return { deps, order, setUser: (value: UserInfo | null) => (current = value) };
}

describe('Apple account deletion', () => {
  it('reauthenticates and revokes the fresh token before deleting a linked Apple account', async () => {
    const { deps, order } = setup(['password', 'apple.com']);
    await deleteAccountWithAppleRevocation(deps);
    expect(deps.revokeApple).toHaveBeenCalledWith('fresh-code');
    expect(order).toEqual(['authenticate', 'revoke', 'delete', 'signOut']);
  });

  it('lets a primary account without a mobile number delete without invoking Apple', async () => {
    const { deps, order } = setup(['password']);
    await deleteAccountWithAppleRevocation(deps);
    expect(order).toEqual(['delete', 'signOut']);
    expect(deps.reauthenticateApple).not.toHaveBeenCalled();
  });

  it.each(['canceled', 'reauthentication failed'])('does not delete on %s', async (reason) => {
    const { deps } = setup();
    deps.reauthenticateApple.mockRejectedValueOnce(new Error(reason));
    await expect(deleteAccountWithAppleRevocation(deps)).rejects.toThrow(reason);
    expect(deps.revokeApple).not.toHaveBeenCalled();
    expect(deps.deleteData).not.toHaveBeenCalled();
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it('does not delete if Apple returns no revocation code', async () => {
    const { deps } = setup();
    deps.reauthenticateApple.mockResolvedValueOnce('');
    await expect(deleteAccountWithAppleRevocation(deps)).rejects.toThrow('revocation token');
    expect(deps.revokeApple).not.toHaveBeenCalled();
    expect(deps.deleteData).not.toHaveBeenCalled();
  });

  it('does not delete or sign out if revocation fails', async () => {
    const { deps } = setup();
    deps.revokeApple.mockRejectedValueOnce(new Error('offline'));
    await expect(deleteAccountWithAppleRevocation(deps)).rejects.toThrow('offline');
    expect(deps.deleteData).not.toHaveBeenCalled();
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it.each(['authenticate', 'revoke'])(
    'never deletes the new account after a switch during %s',
    async (step) => {
      const { deps, setUser } = setup();
      const change = () => setUser({ uid: 'other', isAnonymous: false, providerIds: ['password'] });
      if (step === 'authenticate')
        deps.reauthenticateApple.mockImplementationOnce(async () => {
          change();
          return 'fresh-code';
        });
      else deps.revokeApple.mockImplementationOnce(async () => void change());
      await expect(deleteAccountWithAppleRevocation(deps)).rejects.toThrow('Account changed');
      expect(deps.deleteData).not.toHaveBeenCalled();
    },
  );

  it('does not sign out another account that appeared while deletion was in flight', async () => {
    const { deps, setUser } = setup();
    deps.deleteData.mockImplementationOnce(async () => {
      setUser({ uid: 'other', isAnonymous: false, providerIds: ['password'] });
    });
    await deleteAccountWithAppleRevocation(deps);
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it('preserves the signed-in account for retry when server deletion fails', async () => {
    const { deps } = setup();
    deps.deleteData.mockRejectedValueOnce(new Error('server unavailable'));
    await expect(deleteAccountWithAppleRevocation(deps)).rejects.toThrow('server unavailable');
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it('does not contact providers or delete data without an authenticated account', async () => {
    const { deps, setUser } = setup();
    setUser(null);
    await expect(deleteAccountWithAppleRevocation(deps)).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(deps.reauthenticateApple).not.toHaveBeenCalled();
    expect(deps.deleteData).not.toHaveBeenCalled();
  });
});

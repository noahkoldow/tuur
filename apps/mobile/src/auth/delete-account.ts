import { BackendError, type UserInfo } from '../backend/types';

interface DeletionDependencies {
  current: () => UserInfo | null;
  /** Reauthenticates the same Firebase user, then returns a fresh Apple code/token. Never persist it. */
  reauthenticateApple: () => Promise<string>;
  revokeApple: (token: string) => Promise<void>;
  deleteData: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Revocation must succeed before deletion; a canceled prompt or changed account leaves data intact. */
export async function deleteAccountWithAppleRevocation(deps: DeletionDependencies): Promise<void> {
  const user = deps.current();
  if (!user) throw new BackendError('unauthenticated', 'Sign in before deleting your account');
  const assertOwner = () => {
    if (deps.current()?.uid !== user.uid) throw new BackendError('unauthenticated', 'Account changed');
  };
  if (user.providerIds?.includes('apple.com')) {
    const token = await deps.reauthenticateApple();
    assertOwner();
    if (!token) throw new BackendError('unavailable', 'Apple did not return a revocation token');
    await deps.revokeApple(token);
    assertOwner();
  }
  assertOwner();
  await deps.deleteData();
  // Do not sign out a different user if the account changed while the server completed deletion.
  if (deps.current()?.uid === user.uid) await deps.signOut().catch(() => undefined);
}

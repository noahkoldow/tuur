import { useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useBackend } from '../../src/backend';
import { useAuth } from '../../src/auth/session';
import { authErrorKey } from '../../src/auth/policy';
import { clearDeletedAccountData } from '../../src/auth/delete-local-data';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { ScrollScreen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';

/** Accessible before onboarding or optional phone verification, as well as from Settings. */
export default function DeleteAccount() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const deletedUid = useRef<string | undefined>(undefined);
  const [deleted, setDeleted] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [error, setError] = useState<string>();

  const remove = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (!deletedUid.current) {
        const uid = backend.auth.current()?.uid;
        if (!uid) return;
        // Apple reauthentication/revocation occurs here. Do not erase any local data beforehand.
        await backend.deleteAccount();
        deletedUid.current = uid;
        setDeleted(true);
      }
      await clearDeletedAccountData(deletedUid.current);
      setCleanupPending(false);
    } catch (cause) {
      if (deletedUid.current) {
        setCleanupPending(true);
        setError(t('auth.deleteLocalFailed'));
      } else if (authErrorKey(cause)) {
        setError(t('account.deleteFailed'));
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <ScrollScreen>
      <Stack.Screen
        options={{
          title: t('account.delete'),
          gestureEnabled: !busy,
          headerBackVisible: !busy,
        }}
      />
      {error ? <Banner tone="warning" text={error} /> : null}
      {deleted ? (
        <>
          <Banner text={t('account.deleted')} />
          {cleanupPending ? (
            <Button label={t('auth.deleteLocalRetry')} loading={busy} onPress={() => void remove()} />
          ) : (
            <Button label={t('common.done')} disabled={busy} onPress={() => router.replace('/')} />
          )}
        </>
      ) : user ? (
        <>
          <Text variant="title2">{t('account.deleteTitle')}</Text>
          <Text selectable>{user.email ?? user.phoneNumber}</Text>
          <Text>{t('account.deleteBody')}</Text>
          {user.providerIds?.includes('apple.com') ? (
            <Text variant="footnote">{t('auth.deleteAppleNotice')}</Text>
          ) : null}
          <Button label={t('account.deleteConfirm')} loading={busy} onPress={() => void remove()} />
          <Button
            variant="ghost"
            label={t('common.cancel')}
            disabled={busy}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </>
      ) : (
        <Button label={t('auth.signIn')} onPress={() => router.replace('/sign-in')} />
      )}
    </ScrollScreen>
  );
}
